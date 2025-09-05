# ESP32-S3 Serial Microphone

ESP32-S3 firmware that captures audio from a PDM microphone and streams it via USB CDC serial as binary PCM16 packets. Designed to work with the Web Serial frontend for real-time audio analysis and visualization.

## 🎯 Overview

This firmware transforms the ESP32-S3 into a high-performance audio capture device that streams real-time audio data to a web browser via the Web Serial API. It provides low-latency, high-quality audio capture with built-in signal processing and error detection.

## ✨ Features

### Audio Capture
- **PDM Microphone Input**: Digital microphone interface
- **16kHz Sample Rate**: Optimized for speech and general audio
- **16-bit Resolution**: High-quality audio capture
- **Mono Channel**: Single microphone input

### Signal Processing
- **DC Blocking**: Automatic DC component removal
- **Real-time Processing**: Low-latency audio pipeline
- **Smooth Filtering**: Block-mean DC removal with slew limiting
- **Saturation Protection**: Prevents audio clipping

### Data Transmission
- **Binary Protocol**: Efficient packet-based communication
- **CRC-16 Validation**: Data integrity checking
- **Sequence Numbering**: Packet ordering and loss detection
- **Timestamping**: Microsecond-precision timing
- **USB CDC**: High-speed serial communication

### Hardware Integration
- **I2S Interface**: Standard digital audio interface
- **PDM Support**: Direct PDM microphone connection
- **GPIO Configuration**: Flexible pin assignments
- **Power Management**: Efficient power usage

## 🚀 Quick Start

### Prerequisites
- ESP32-S3 development board (DevKitC-1 recommended)
- PDM microphone module
- PlatformIO or Arduino IDE
- USB-C cable for programming and communication

### Hardware Setup

#### Pin Connections
```
ESP32-S3    PDM Microphone
GPIO 9  →   Clock (BCLK)
GPIO 10 →   Word Select (WS/LRCLK)
GPIO 11 →   Data (DATA)
3.3V    →   VCC
GND     →   GND
```

#### PDM Microphone Requirements
- **Type**: Digital PDM microphone
- **Voltage**: 3.3V compatible
- **Interface**: I2S/PDM standard
- **Sample Rate**: 16kHz capable
- **Channels**: Mono (single channel)

### Software Installation

#### Using PlatformIO (Recommended)
```bash
# Install PlatformIO
pip install platformio

# Build and upload
pio run -t upload

# Monitor serial output
pio device monitor
```

#### Using Arduino IDE
1. **Install ESP32 Board Package**
2. **Select Board**: ESP32S3 Dev Module
3. **Configure Settings**:
   - USB CDC On Boot: Enabled
   - CPU Frequency: 240MHz
   - Flash Mode: QIO
   - Flash Size: 4MB
4. **Upload Code**

### Verification
1. **Connect to computer** via USB-C
2. **Open serial monitor** (115200 baud)
3. **Check for startup messages**
4. **Verify packet transmission** in Web Serial frontend

## 🔧 Configuration

### User-Configurable Settings
```cpp
#define SAMPLE_RATE 16000        // Audio sample rate (Hz)
#define I2C_SAMPLE_RATE 16000    // I2S sample rate (Hz)
#define SAMPLE_BUFFER_SIZE 1024  // I2S buffer size (samples)
#define SERIAL_BAUD 115200       // Serial baud rate
#define USE_CRC 1                // Enable CRC validation
```

### Pin Configuration
```cpp
#define I2S_MIC_SERIAL_CLOCK GPIO_NUM_9      // BCLK
#define I2S_MIC_LEFT_RIGHT_CLOCK GPIO_NUM_10 // WS/LRCLK
#define I2S_MIC_SERIAL_DATA GPIO_NUM_11      // DATA
```

### I2S Configuration
```cpp
// PDM microphone configuration
.mode = I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM
.sample_rate = 16000
.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT
.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT
```

## 📡 Communication Protocol

### Packet Format
```
[0xA6][uint16 len][uint32 seq][uint32 usec][PCM16 payload][uint16 crc]
```

### Packet Structure
- **Sync Byte (1 byte)**: 0xA6 for packet identification
- **Length (2 bytes)**: Payload size in bytes (little-endian)
- **Sequence (4 bytes)**: Packet sequence number (little-endian)
- **Timestamp (4 bytes)**: Microsecond timestamp (little-endian)
- **Payload (N bytes)**: PCM16 audio data (little-endian)
- **CRC (2 bytes)**: CRC-16/CCITT checksum (little-endian)

### Example Packet
```
A6 00 08 01 00 00 00 12 34 56 78 00 01 02 03 ... AB CD
│  │     │        │        │              │     │
│  │     │        │        │              │     └─ CRC
│  │     │        │        │              └─────── Payload
│  │     │        │        └────────────────────── Timestamp
│  │     │        └─────────────────────────────── Sequence
│  │     └──────────────────────────────────────── Length
│  └────────────────────────────────────────────── Sync
└───────────────────────────────────────────────── Start
```

## 🔍 Technical Details

### Audio Processing Pipeline
1. **I2S Capture**: Read PDM data from microphone
2. **DC Blocking**: Remove DC component using block-mean filtering
3. **Packet Assembly**: Create binary packet with header
4. **CRC Calculation**: Compute checksum for data integrity
5. **Serial Transmission**: Send packet via USB CDC

### DC Blocking Algorithm
```cpp
// Block-mean DC removal with slew limiting
int32_t dc_est = 0;  // Q15 running DC estimate
#define LERP_SHIFT 10  // Slew rate control

// For each audio block:
1. Calculate block mean
2. Slew DC estimate towards block mean
3. Subtract DC estimate from samples
4. Apply saturation protection
```

### Memory Management
- **Static Buffers**: Pre-allocated for real-time performance
- **Queue System**: FreeRTOS queue for packet transmission
- **DMA Buffers**: I2S DMA for efficient data transfer
- **Stack Allocation**: Task-specific stack management

### Performance Characteristics
- **Latency**: <10ms end-to-end
- **Throughput**: ~32 kB/s at 16kHz
- **CPU Usage**: <20% on ESP32-S3
- **Memory Usage**: <50KB RAM
- **Power Consumption**: <200mA typical

## 🛠️ Development

### Project Structure
```
serial-mic/
├── src/
│   └── main.cpp          # Main firmware code
├── include/              # Header files
├── lib/                  # Library files
├── test/                 # Test files
├── platformio.ini        # PlatformIO configuration
└── README.md            # This file
```

### Build Configuration
```ini
[env:esp32-s3-devkitc-1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
build_flags = -DARDUINO_USB_CDC_ON_BOOT=1 -Ofast
monitor_speed = 115200
monitor_filters = esp32_exception_decoder
```

### Key Components
- **I2S Driver**: ESP-IDF I2S interface
- **FreeRTOS**: Real-time operating system
- **USB CDC**: USB serial communication
- **CRC Library**: Data integrity checking

### Adding Features
1. **New Audio Formats**: Modify I2S configuration
2. **Additional Processing**: Add to audio pipeline
3. **Protocol Extensions**: Extend packet format
4. **Hardware Support**: Add new GPIO configurations

## 🐛 Troubleshooting

### Common Issues

1. **No audio input**:
   - Check PDM microphone connections
   - Verify GPIO pin assignments
   - Test microphone with multimeter
   - Check power supply (3.3V)

2. **Serial communication fails**:
   - Verify USB-C cable connection
   - Check baud rate (115200)
   - Enable USB CDC on boot
   - Try different USB port

3. **Poor audio quality**:
   - Check microphone specifications
   - Verify sample rate configuration
   - Test with different microphone
   - Check power supply stability

4. **CRC errors**:
   - Check serial connection quality
   - Verify packet format
   - Test with different baud rate
   - Check for electrical interference

5. **Build errors**:
   - Update PlatformIO/Arduino IDE
   - Check ESP32 board package version
   - Verify build flags
   - Clean and rebuild project

### Debug Features
- **Serial Output**: Debug messages via USB CDC
- **Packet Statistics**: Transmission monitoring
- **Error Logging**: Detailed error information
- **Performance Metrics**: CPU and memory usage

### Debug Commands
```cpp
// Enable debug output
#define DEBUG_ENABLED 1

// Monitor serial output
pio device monitor --baud 115200

// Check packet statistics
// (Available in Web Serial frontend)
```

## 📊 Performance Optimization

### Optimization Tips
1. **Increase Buffer Size**: Reduce interrupt frequency
2. **Optimize I2S Settings**: Tune DMA and buffer parameters
3. **Reduce Processing**: Minimize audio processing overhead
4. **Power Management**: Use sleep modes when possible

### Benchmarking
- **Latency Test**: Measure end-to-end delay
- **Throughput Test**: Verify data rate capabilities
- **Quality Test**: Analyze audio fidelity
- **Stability Test**: Long-term operation testing

## 🔒 Security Considerations

### Data Privacy
- **Local Processing**: All audio processing on-device
- **No Network**: No internet connectivity required
- **User Control**: User controls data transmission
- **No Storage**: No persistent audio storage

### Communication Security
- **Local Connection**: USB-only communication
- **No Authentication**: Direct hardware connection
- **CRC Validation**: Data integrity protection
- **Error Handling**: Graceful failure modes

## 📄 License

This project is part of the microphone audio processing suite. See the main repository README for license information.

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional audio formats
- Enhanced signal processing
- Power optimization
- Hardware compatibility
- Performance improvements
- Documentation updates
