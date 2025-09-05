# ESP32-S3 USB Audio Device

ESP32-S3 implementation of a USB Audio Class (UAC) device that appears as a standard USB microphone and speaker to the host computer. Provides plug-and-play audio functionality with both input and output capabilities.

This uses the `espressif/usb_device_uac` [component](https://components.espressif.com/components/espressif/usb_device_uac/versions/1.2.1/readme)

## WARNING - this seems to be a bit experimental!

There is an important setting that makes this work on Mac computers, but not on Windows - `CONFIG_UAC_SUPPORT_MACOS` enabling this makes it work on Mac computers - but it stops it working properly on Windows machines...

## 🎯 Overview

This firmware transforms the ESP32-S3 into a USB Audio Class 2.0 compliant device that can be used as a standard USB microphone and speaker. It provides high-quality audio capture from a PDM microphone and audio output via I2S interface, making it compatible with any operating system that supports USB audio devices.

## 🚀 Quick Start

### Prerequisites
- ESP32-S3 development board (DevKitC-1 recommended)
- PDM microphone module
- I2S audio amplifier/speaker (optional)
- ESP-IDF development environment
- USB-C cable for programming and communication

### Hardware Setup

#### Pin Connections
```
ESP32-S3    PDM Microphone    I2S Audio Output
GPIO 9  →   Clock (BCLK)      -
GPIO 10 →   LR Clock (WS)     - (tied to GND)
GPIO 11 →   Data (DATA)       -
GPIO 13 →   -                 Data Out (DOUT)
GPIO 14 →   -                 Bit Clock (BCLK)
GPIO 21 →   -                 Word Select (WS)
GPIO 12 →   -                 Amplifier Enable (SD_MODE)
3.3V    →   VCC               VCC
GND     →   GND               GND
```

### Software Installation

#### ESP-IDF Setup
```bash
# Install ESP-IDF (if not already installed)
git clone --recursive https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh
. ./export.sh

# Build and flash
cd usb-audio
idf.py build
idf.py flash
```

#### Configuration
```bash
# Configure project settings
idf.py menuconfig

# Key settings to configure:
# - USB Audio Class settings
# - Sample rate configuration
# - GPIO pin assignments
# - Power management options
```

### Verification
1. **Connect to computer** via USB-C
2. **Check device recognition** in system audio settings
3. **Test microphone input** in audio applications
4. **Test audio output** with speakers/headphones

## 🔧 Configuration

### USB Audio Settings
```c
// Sample rate configuration
#define CONFIG_UAC_SAMPLE_RATE 48000  // 8kHz to 48kHz

// Audio format settings
#define CONFIG_UAC_BITS_PER_SAMPLE 16
#define CONFIG_UAC_CHANNELS 1  // Mono
```

### GPIO Configuration
```c
// PDM microphone pins
#define MIC_I2S_CLK GPIO_NUM_9   // PDM clock
#define MIC_I2S_LR GPIO_NUM_10   // LR clock (tied to GND)
#define MIC_I2S_DATA GPIO_NUM_11 // PDM data

// I2S output pins
#define SPEAKER_I2S_DOUT GPIO_NUM_13  // Data out
#define SPEAKER_I2S_BCLK GPIO_NUM_14  // Bit clock
#define SPEAKER_I2S_LRC GPIO_NUM_21   // Word select
#define SPEAKER_SD_MODE GPIO_NUM_12   // Amplifier enable
```

### I2S Configuration
```c
// PDM input configuration
i2s_pdm_rx_config_t pdm_cfg = {
    .clk_cfg = I2S_PDM_RX_CLK_DEFAULT_CONFIG(48000),
    .slot_cfg = I2S_PDM_RX_SLOT_DEFAULT_CONFIG(
        I2S_DATA_BIT_WIDTH_16BIT, 
        I2S_SLOT_MODE_MONO
    ),
    .gpio_cfg = {
        .clk = MIC_I2S_CLK,      // GPIO 9
        .din = MIC_I2S_DATA,     // GPIO 11
        .invert_flags = { .clk_inv = false },
    },
};

// I2S output configuration
i2s_std_config_t std_cfg = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(48000),
    .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(
        I2S_DATA_BIT_WIDTH_16BIT,
        I2S_SLOT_MODE_MONO
    ),
    .gpio_cfg = {
        .bclk = SPEAKER_I2S_BCLK,  // GPIO 14
        .ws = SPEAKER_I2S_LRC,     // GPIO 21
        .dout = SPEAKER_I2S_DOUT,  // GPIO 13
        .invert_flags = {
            .mclk_inv = false,
            .bclk_inv = false,
            .ws_inv = false,
        },
    },
};
```

## 🛠️ Development

### Project Structure
```
usb-audio/
├── main/
│   ├── main.c              # Main application code
│   ├── CMakeLists.txt      # Build configuration
│   └── idf_component.yml   # Component dependencies
├── managed_components/     # ESP-IDF managed components
├── build/                  # Build output directory
├── CMakeLists.txt          # Project build configuration
├── sdkconfig              # Project configuration
└── README.md              # This file
```

### Dependencies
- **ESP-IDF**: Espressif IoT Development Framework
- **TinyUSB**: USB device stack
- **USB Audio Class**: UAC 2.0 implementation
- **I2S Driver**: ESP-IDF I2S interface

### Build Configuration
```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(usb-audio)
```

### Key Components
- **USB Device Stack**: TinyUSB implementation
- **Audio Class Driver**: UAC 2.0 driver
- **I2S Driver**: ESP-IDF I2S interface
- **FreeRTOS**: Real-time operating system

## 🐛 Troubleshooting

### Common Issues

1. **Device not recognized**:
   - Check USB cable connection
   - Verify USB port functionality
   - Check device manager/system logs
   - Try different USB port

2. **No audio input**:
   - Check PDM microphone connections
   - Verify GPIO pin assignments
   - Test microphone with multimeter
   - Check power supply (3.3V)

3. **No audio output**:
   - Check I2S amplifier connections
   - Verify amplifier power supply
   - Test with different speakers
   - Check GPIO pin assignments

4. **Poor audio quality**:
   - Check sample rate configuration
   - Verify audio component specifications
   - Test with different components
   - Check power supply stability

5. **Build errors**:
   - Update ESP-IDF to latest version
   - Check component dependencies
   - Verify build configuration
   - Clean and rebuild project

### Debug Features
- **Serial Output**: Debug messages via USB CDC
- **LED Indicators**: Status indication
- **Audio Monitoring**: Real-time audio level monitoring
- **Performance Metrics**: CPU and memory usage

### Debug Commands
```bash
# Monitor serial output
idf.py monitor

# Check device status
idf.py monitor --print-filter="*:INFO"

# Flash with debug info
idf.py build --debug
idf.py flash
```

## 📄 License

This project is part of the microphone audio processing suite. See the main repository README for license information.

## 📚 References

- [USB Audio Class 2.0 Specification](https://www.usb.org/documents)
- [ESP-IDF Programming Guide](https://docs.espressif.com/projects/esp-idf/en/latest/)
- [TinyUSB Documentation](https://docs.tinyusb.org/)
- [I2S Audio Interface](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/i2s.html)