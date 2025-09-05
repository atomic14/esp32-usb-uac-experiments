# Web Serial Audio Tools

A comprehensive web-based audio analysis application that connects to ESP32-S3 hardware via Web Serial API or local microphone for real-time audio processing, visualization, and recording.

## 🎯 Overview

This application provides a complete audio analysis suite with multiple visualization modes, real-time processing, and data export capabilities. It's designed to work seamlessly with the ESP32-S3 serial-mic hardware or as a standalone microphone analyzer.

## ✨ Features

### Audio Input Sources
- **Web Serial**: Connect to ESP32-S3 serial-mic hardware
- **Microphone**: Direct browser microphone access
- **Device Selection**: Choose specific audio input devices

### Real-time Visualizations
- **Oscilloscope**: Time-domain waveform display with gain control
- **Waterfall Spectrogram**: Frequency vs. time heatmap visualization
- **Spectrum Analyzer**: Real-time frequency bars with peak hold
- **Pitch Detection**: Musical note identification with confidence
- **Tuner Gauge**: Visual tuning indicator for musical instruments

### Audio Analysis
- **VU Meter**: Real-time audio level monitoring
- **CRC Validation**: Data integrity checking for serial input
- **Sample Rate Control**: Configurable audio sample rates
- **Multiple Colormaps**: Turbo, Viridis, Inferno, Jet spectrogram palettes

### Recording & Export
- **WAV Recording**: High-quality audio capture
- **Real-time Streaming**: Live data transmission
- **Download Support**: Export recordings as WAV files

### Debug & Monitoring
- **Connection Status**: Real-time connection monitoring
- **Packet Statistics**: Data throughput and error tracking
- **Debug Logging**: Detailed operation logs
- **Performance Metrics**: Frame rates and processing stats

## 🚀 Quick Start

### Prerequisites
- Modern browser with Web Serial API support (Chrome/Edge recommended)
- ESP32-S3 hardware with serial-mic firmware (optional)
- Node.js and npm (for development)

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Preview Build
```bash
npm run preview
```

## 🎮 Usage

### Connecting to Hardware
1. **Flash serial-mic firmware** to your ESP32-S3
2. **Connect PDM microphone** to the specified GPIO pins
3. **Open the application** in Chrome or Edge browser
4. **Click "Connect"** and select your ESP32-S3 device
5. **Grant permissions** when prompted

### Using Microphone Input
1. **Select "Microphone"** as input source
2. **Choose audio device** from the dropdown
3. **Click "Connect"** to start audio capture
4. **Grant microphone permissions** when prompted

### Recording Audio
1. **Start a connection** (serial or microphone)
2. **Click "Start Recording"** to begin capture
3. **Click "Stop Recording"** when finished
4. **Click "Download"** to save as WAV file

### Visualization Controls
- **Sample Rate**: Adjust audio sample rate (8kHz - 48kHz)
- **Colormap**: Select spectrogram color scheme
- **CRC Check**: Enable/disable data validation
- **Scope Gain**: Amplify oscilloscope display
- **Help**: Access detailed usage instructions

## 🔧 Configuration

### Default Settings
```typescript
{
  sampleRate: 16000,        // Audio sample rate (Hz)
  fftSize: 1024,           // FFT analysis size
  minDecibels: -80,        // Minimum signal level
  maxDecibels: 0,          // Maximum signal level
  peakHoldDecay: 12,       // Peak hold decay (dB/sec)
  levelDecay: 50,          // Level decay (dB/sec)
  bands: 31,               // Spectrum analyzer bands
  segments: 28,            // Spectrum segments
  segmentGap: 2,           // Gap between segments (px)
  glow: true               // Enable visual effects
}
```

### Serial Protocol
The application expects binary packets from the ESP32-S3 in this format:
```
[0xA6][uint16 len][uint32 seq][uint32 usec][PCM16 payload][uint16 crc]
```

- **Sync Byte**: 0xA6 for packet identification
- **Length**: Payload size in bytes
- **Sequence**: Packet sequence number
- **Timestamp**: Microsecond timestamp
- **Payload**: PCM16 audio data (little-endian)
- **CRC**: CRC-16/CCITT checksum

## 🎨 Visualization Details

### Oscilloscope
- **Time Domain**: Shows audio waveform over time
- **Gain Control**: Amplify weak signals
- **Auto-scaling**: Automatic vertical scaling
- **Real-time Updates**: 60 FPS display

### Spectrogram
- **Frequency vs. Time**: 2D heatmap visualization
- **Colormap Options**: Multiple scientific palettes
- **Configurable Range**: Adjustable frequency limits
- **Smooth Updates**: Interpolated display

### Spectrum Analyzer
- **Frequency Bars**: Real-time frequency analysis
- **Peak Hold**: Maintains peak values with decay
- **Visual Effects**: Glow and segment styling
- **Band Control**: Configurable frequency bands

### Pitch Detection
- **Autocorrelation**: Robust pitch detection algorithm
- **Note Display**: Musical note identification
- **Confidence**: Detection reliability indicator
- **Tuner Gauge**: Visual tuning assistance

## 🔍 Technical Details

### Audio Processing Pipeline
1. **Input Capture**: Web Serial or Web Audio API
2. **Packet Parsing**: Binary protocol decoding
3. **CRC Validation**: Data integrity checking
4. **FFT Analysis**: Frequency domain processing
5. **Visualization**: Canvas-based rendering
6. **Recording**: WAV file generation

### Performance Optimization
- **Efficient FFT**: Optimized frequency analysis
- **Canvas Rendering**: Hardware-accelerated graphics
- **Memory Management**: Efficient buffer handling
- **Frame Rate Control**: Smooth 60 FPS updates
- **Adaptive Processing**: Dynamic quality adjustment

### Browser Compatibility
- **Web Serial API**: Chrome 89+, Edge 89+
- **Web Audio API**: All modern browsers
- **Canvas API**: All modern browsers
- **File API**: All modern browsers

## 🛠️ Development

### Project Structure
```
frontend/
├── src/
│   ├── main.ts           # Application entry point
│   ├── serial.ts         # Web Serial communication
│   ├── mic.ts           # Microphone input handling
│   ├── parser.ts        # Binary packet parsing
│   ├── visuals.ts       # Canvas rendering
│   ├── spectrum.ts      # Spectrum analyzer
│   ├── pitch.ts         # Pitch detection
│   ├── wav.ts           # WAV file generation
│   ├── crc.ts           # CRC validation
│   └── fft.ts           # FFT processing
├── index.html           # Main HTML template
├── test.html           # Test page
└── package.json        # Dependencies and scripts
```

### Key Dependencies
- **TypeScript**: Type-safe JavaScript development
- **Vite**: Fast build tool and dev server
- **Web APIs**: Web Serial, Web Audio, Canvas

### Adding New Features
1. **New Visualizations**: Add to `visuals.ts`
2. **Audio Processing**: Extend `fft.ts` or create new modules
3. **UI Controls**: Add to HTML and wire up event handlers
4. **Protocol Extensions**: Modify `parser.ts` for new packet types

## 🐛 Troubleshooting

### Common Issues

1. **Web Serial not available**:
   - Use Chrome or Edge browser
   - Enable experimental web platform features
   - Check browser version (89+ required)

2. **Connection fails**:
   - Verify ESP32-S3 is connected
   - Check firmware is flashed correctly
   - Try different USB cable/port
   - Restart browser

3. **No audio input**:
   - Check microphone permissions
   - Verify audio device selection
   - Test with different input source
   - Check browser audio settings

4. **Poor performance**:
   - Reduce sample rate
   - Lower FFT size
   - Close other browser tabs
   - Check system resources

5. **CRC errors**:
   - Check serial connection quality
   - Verify firmware configuration
   - Try different baud rate
   - Check power supply stability

### Debug Features
- **Connection Status**: Real-time connection monitoring
- **Packet Statistics**: Data throughput tracking
- **Error Logging**: Detailed operation logs
- **Performance Metrics**: Frame rate and processing stats

### Debug Console
Open browser developer tools (F12) to access:
- **Console Logs**: Detailed operation information
- **Network Tab**: Web Serial communication
- **Performance Tab**: Rendering and processing metrics

## 📊 Performance Metrics

### Typical Performance
- **Frame Rate**: 60 FPS for visualizations
- **Latency**: <50ms for real-time processing
- **CPU Usage**: <10% on modern systems
- **Memory Usage**: <100MB typical

### Optimization Tips
- **Lower Sample Rates**: Reduce processing load
- **Smaller FFT**: Faster frequency analysis
- **Fewer Bands**: Reduce spectrum complexity
- **Disable Effects**: Turn off visual enhancements

## 📄 License

This project is part of the microphone audio processing suite. See the main repository README for license information.

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional visualization modes
- Audio effect processing
- Mobile device optimization
- Performance enhancements
- New protocol support
- UI/UX improvements
