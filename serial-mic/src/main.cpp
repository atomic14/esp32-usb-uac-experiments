// ESP32-S3 PDM mic -> USB CDC Serial (binary PCM16 packets for Web Serial
// frontend)
#include "esp_timer.h"
#include <Arduino.h>
#include <driver/i2s.h>
#include <math.h>

// ====================== User-tweakables ======================
#define SAMPLE_RATE 16000     // Hz (frontend defaults to 16 kHz)
#define I2C_SAMPLE_RATE 16000 // Hz (frontend defaults to 16 kHz)
#define SAMPLE_BUFFER_SIZE 1024 // I2S read chunk in samples (PCM16 payload = 2048 bytes)
#define SERIAL_BAUD 115200 // USB-CDC ignores baud, but keep for compatibility
#define USE_CRC 1          // 1 = append CRC-16/CCITT

// Test signals removed; always use microphone input

// Most PDM mics default to LEFT when L/R is strapped; change if needed
#define I2S_MIC_CHANNEL I2S_CHANNEL_FMT_ONLY_LEFT

// Pins (your wiring)
#define I2S_MIC_SERIAL_CLOCK GPIO_NUM_9      // BCLK
#define I2S_MIC_LEFT_RIGHT_CLOCK GPIO_NUM_10 // WS/LRCLK
#define I2S_MIC_SERIAL_DATA GPIO_NUM_11      // DATA

// ====================== I2S config (keep as-is unless wiring/rate changes)
// ======================
static i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM),
    .sample_rate = I2C_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_MIC_CHANNEL,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0};

static i2s_pin_config_t i2s_mic_pins = {.bck_io_num = I2S_MIC_SERIAL_CLOCK,
                                        .ws_io_num = I2S_MIC_LEFT_RIGHT_CLOCK,
                                        .data_out_num = I2S_PIN_NO_CHANGE,
                                        .data_in_num = I2S_MIC_SERIAL_DATA};

// ====================== Packet format ======================
// [0xA6][uint16 len][uint32 seq][uint32 usec][payload bytes][uint16 crc]
// Note: The first byte is a sync marker (0xA6). Payload is PCM16 little-endian.
static const uint8_t PKT_SYNC = 0xA6;
static const size_t PKT_HEADER_LEN =
    1 + 2 + 4 + 4;                       // type + length + seq + usec
static const size_t PKT_TRAILER_LEN = 2; // crc16
// PCM16 payload is 2 bytes per sample
static const size_t MAX_PAYLOAD_BYTES = SAMPLE_BUFFER_SIZE * 2;
static const size_t MAX_PKT_BYTES =
    PKT_HEADER_LEN + MAX_PAYLOAD_BYTES + PKT_TRAILER_LEN;

// ====================== Buffers ======================
static int16_t sample_buf[SAMPLE_BUFFER_SIZE]; // raw from I2S
static uint8_t tx_buf[MAX_PKT_BYTES];

// Smooth block-mean DC remover
// Use per block of N (e.g., your codec frame size). Pick LERP_SHIFT to slew the
// DC estimate smoothly between old and new means; S=8..11 are gentle.
#define LERP_SHIFT 10  // larger => slower update

static int32_t dc_est = 0; // Q15 running DC estimate

static inline int16_t sat16(int32_t v){
  if (v >  32767) return  32767;
  if (v < -32768) return -32768;
  return (int16_t)v;
}

static void dc_block_and_copy(int16_t * __restrict a, int n){
  // compute block mean in int32 to avoid overflow
  int64_t sum = 0;
  for(int i=0;i<n;i++) sum += a[i];
  int32_t mean_q15 = (int32_t)((sum / n) << 15); // int16 mean -> Q15

  // slew dc_est towards block mean to avoid zipper noise
  // dc_est += (mean_q15 - dc_est) * (1/2^LERP_SHIFT)
  dc_est += ( (mean_q15 - dc_est) >> LERP_SHIFT );

  // subtract DC estimate
  for(int i=0;i<n;i++){
    int32_t y = ((int32_t)a[i] << 15) - dc_est; // Q15
    a[i] = sat16( (y + (1<<14)) >> 15 );        // back to int16
  }
}

// ====================== CRC-16/CCITT (0x1021, init 0xFFFF, no XORout)
// ======================
static uint16_t crc16_ccitt(const uint8_t *data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; ++i) {
    crc ^= (uint16_t)data[i] << 8;
    for (int b = 0; b < 8; ++b) {
      if (crc & 0x8000)
        crc = (crc << 1) ^ 0x1021;
      else
        crc <<= 1;
    }
  }
  return crc;
}

// ====================== Helpers ======================
static inline void le_write16(uint8_t *p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
}
static inline void le_write32(uint8_t *p, uint32_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
  p[2] = (uint8_t)((v >> 16) & 0xFF);
  p[3] = (uint8_t)((v >> 24) & 0xFF);
}

// ====================== Queue definitions ======================
struct tx_packet_t {
  uint8_t *data;
  size_t length;
};
static QueueHandle_t tx_queue;

static void i2s_reader_task(void *arg) {
  // I2S driver (always on to maintain timing cadence even in test modes)
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &i2s_mic_pins);

  // Ensure clock config is locked in (mono, 16-bit, SR)
  // (On some cores this call is recommended to force slot/sample settings.)
  i2s_set_clk(I2S_NUM_0, I2C_SAMPLE_RATE, I2S_BITS_PER_SAMPLE_16BIT,
              I2S_CHANNEL_MONO);

  static uint32_t seq = 0;
  while (true) {
    // read from i2s
    size_t bytes_read = 0;
    esp_err_t err = i2s_read(I2S_NUM_0, (void *)sample_buf,
                             SAMPLE_BUFFER_SIZE * sizeof(int16_t),
                             &bytes_read, portMAX_DELAY);
    if (err != ESP_OK || bytes_read == 0) {
      // In practice this shouldn't happen; if it does, just try again.
      continue;
    }
    int samples_read = (int)(bytes_read / sizeof(int16_t));

    // DC block in place
    dc_block_and_copy(sample_buf, samples_read);

    // Frame into a single packet and enqueue for TX
    const uint32_t now_usecs = (uint32_t)esp_timer_get_time();
    const int this_samples = samples_read;
    const uint16_t payload_len = (uint16_t)(this_samples * 2);

    uint8_t *p = tx_buf;
    *p++ = PKT_SYNC; // sync
    le_write16(p, payload_len); p += 2; // length
    le_write32(p, seq++);        p += 4; // seq
    le_write32(p, now_usecs);    p += 4; // timestamp

    // payload (PCM16 little-endian)
    for (int i = 0; i < this_samples; ++i) {
      const int16_t s = sample_buf[i];
      *p++ = (uint8_t)(s & 0xFF);
      *p++ = (uint8_t)((s >> 8) & 0xFF);
    }

    // CRC over header + payload
    #if USE_CRC
    const uint16_t crc = crc16_ccitt(tx_buf, PKT_HEADER_LEN + payload_len);
    #else
    const uint16_t crc = 0;
    #endif
    le_write16(p, crc); p += 2;

    const size_t total_len = (size_t)(PKT_HEADER_LEN + payload_len + PKT_TRAILER_LEN);
    tx_packet_t pkt;
    pkt.data = (uint8_t *)malloc(total_len);
    if (!pkt.data) {
      // allocation failed, drop this packet
      continue;
    }
    memcpy(pkt.data, tx_buf, total_len);
    pkt.length = total_len;
    xQueueSend(tx_queue, &pkt, portMAX_DELAY);
  }
}

// ====================== Setup ======================
void setup() {
  // USB-CDC serial for binary packets
  Serial.begin(SERIAL_BAUD);
  Serial.setTxBufferSize(32768);

  // I2S driver (always on to maintain timing cadence even in test modes)
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &i2s_mic_pins);

  // Ensure clock config is locked in (mono, 16-bit, SR)
  // (On some cores this call is recommended to force slot/sample settings.)
  i2s_set_clk(I2S_NUM_0, I2C_SAMPLE_RATE, I2S_BITS_PER_SAMPLE_16BIT,
              I2S_CHANNEL_MONO);


  // create TX queue
  tx_queue = xQueueCreate(16, sizeof(tx_packet_t));

  // kick off a task pinned to core 0 for the i2s reader
  xTaskCreatePinnedToCore(i2s_reader_task, "i2s_reader", 8192, NULL, 1, NULL,
                          0);
}

// ====================== Main loop ======================
void loop() {
  // Drain TX queue and write to Serial
  tx_packet_t pkt;
  if (xQueueReceive(tx_queue, &pkt, portMAX_DELAY) == pdPASS) {
    Serial.write(pkt.data, pkt.length);
    free(pkt.data);
  }
}
