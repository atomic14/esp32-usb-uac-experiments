[![Frontend Build and Test](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/frontend.yml/badge.svg)](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/frontend.yml)
[![3D Visualiser Build and Test](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/3d-visualiser.yml/badge.svg)](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/3d-visualiser.yml)
[![Serial Mic Build and Test](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/serial-mic.yml/badge.svg)](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/serial-mic.yml)
[![USB Audio Build and Test](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/usb-audio.yml/badge.svg)](https://github.com/atomic14/esp32-usb-uac-experiments/actions/workflows/usb-audio.yml)

# ESP32 Audio Experiements

A A collection of audio processing tools and hardware for the ESP32.

## 🎯 Overview

This repository contains a complete audio processing ecosystem with both hardware and software components:

- **Hardware**: ESP32-S3 based microphone interfaces
- **Software**: Web-based audio analysis and 3D visualization tools
- **Protocols**: USB Audio Class (UAC) and Web Serial communication

## 📁 Project Structure

### Hardware Projects

#### [`serial-mic/`](./serial-mic/)
ESP32-S3 firmware that captures audio from a PDM microphone and streams it via USB CDC serial as binary PCM16 packets. Designed to work with the Web Serial frontend for real-time audio analysis.

**Key Features:**
- PDM microphone input (16kHz, 16-bit)
- Real-time DC blocking and signal processing
- CRC-16 error detection
- Binary packet protocol for reliable data transfer

#### [`usb-audio/`](./usb-audio/)
ESP32-S3 implementation of a USB Audio Class (UAC) device that appears as a standard USB microphone to the host computer. Provides both input (microphone) and output (speaker) capabilities.

**Key Features:**
- USB Audio Class 2.0 compliant
- PDM microphone input
- I2S audio output
- Volume and mute controls
- Plug-and-play USB device

### Software Projects

#### [`frontend/`](./frontend/)
Web-based audio analysis application that connects to either the serial-mic hardware or local microphone for real-time audio processing and visualization.

**Key Features:**
- Web Serial API integration
- Real-time oscilloscope display
- Waterfall spectrogram
- Frequency spectrum analyzer
- Pitch detection and tuner
- Audio recording and WAV export
- Multiple colormap options

#### [`3d-visualiser/`](./3d-visualiser/)
Advanced 3D waterfall spectrogram visualizer built with Three.js. Creates a 3D representations of audio frequency data over time.

**Key Features:**
- Interactive 3D visualization
- Multiple colormap palettes (Turbo, Viridis, Inferno, Jet)
- Real-time microphone input
- Audio file playback support
- Orbit controls for 3D navigation
- Configurable visualization parameters

## 🚀 Quick Start

### Hardware Setup

1. **For Serial Communication:**
   - Flash the `serial-mic` firmware to your ESP32-S3
   - Connect a PDM microphone to the specified GPIO pins
   - Use the `frontend` application to connect via Web Serial

2. **For USB Audio Device:**
   - Flash the `usb-audio` firmware to your ESP32-S3
   - Connect PDM microphone and I2S audio output
   - The device will appear as a standard USB microphone

### Software Setup

1. **Frontend Application:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

2. **3D Visualizer:**
   ```bash
   cd 3d-visualiser
   npm install
   npm run dev
   ```

## 🔧 Hardware Requirements

### ESP32-S3 Development Board
- ESP32-S3-DevKitC-1 or compatible
- USB-C connection for programming and communication

### Audio Components
- **PDM Microphone**: Digital microphone with PDM output
- **Audio Amplifier**: For USB audio output (optional)
- **Connectors**: Appropriate connectors for your setup

### Pin Connections

#### Serial-Mic Project
- GPIO 9: PDM Clock (BCLK)
- GPIO 10: PDM Word Select (WS/LRCLK)  
- GPIO 11: PDM Data

#### USB-Audio Project
- GPIO 9: PDM Clock
- GPIO 11: PDM Data
- GPIO 13: I2S Data Out
- GPIO 14: I2S Bit Clock
- GPIO 21: I2S Word Select
- GPIO 12: Amplifier Enable

## 📊 Features

### Real-time Audio Analysis
- **Oscilloscope**: Time-domain waveform display
- **Spectrogram**: Frequency vs. time visualization
- **Spectrum Analyzer**: Real-time frequency analysis
- **Pitch Detection**: Musical note identification
- **VU Meter**: Audio level monitoring

### 3D Visualization
- **Waterfall Display**: 3D frequency-time representation
- **Interactive Controls**: Orbit, zoom, and pan
- **Multiple Palettes**: Scientific and artistic colormaps
- **Real-time Updates**: Live audio stream processing

### Data Export
- **WAV Recording**: High-quality audio capture
- **Real-time Streaming**: Live data transmission
- **Error Detection**: CRC validation for data integrity

## 🛠️ Development

### Building Firmware

#### Serial-Mic (PlatformIO)
```bash
cd serial-mic
pio run -t upload
```

#### USB-Audio (ESP-IDF)
```bash
cd usb-audio
idf.py build
idf.py flash
```

### Web Development
Both web applications use Vite for development and building:

```bash
# Development server
npm run dev

# Production build
npm run build

# Preview build
npm run preview
```

## 📋 Browser Compatibility

### Web Serial API
- **Chrome/Chromium**: Full support
- **Edge**: Full support  
- **Firefox**: Not supported
- **Safari**: Not supported

### Web Audio API
- **All modern browsers**: Supported

## 🔍 Troubleshooting

### Common Issues

1. **Web Serial not available**: Use Chrome or Edge browser
2. **Microphone permissions**: Grant audio permissions when prompted
3. **USB connection issues**: Check USB cable and drivers
4. **Audio quality**: Verify microphone connections and power supply

### Debug Features
- Real-time packet statistics
- CRC error monitoring
- Connection status indicators
- Detailed logging output

## 📄 License

This project is open source. Please check individual project directories for specific license information.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## 📚 Documentation

Each project contains detailed documentation in its respective README file:
- [Serial-Mic Documentation](./serial-mic/README.md)
- [USB-Audio Documentation](./usb-audio/README.md)
- [Frontend Documentation](./frontend/README.md)
- [3D Visualizer Documentation](./3d-visualiser/README.md)
