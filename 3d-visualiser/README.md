# 3D Audio Visualizer

A stunning 3D waterfall spectrogram visualizer built with Three.js that creates interactive 3D representations of audio frequency data over time.

## 🎯 Overview

This application transforms audio input into beautiful 3D visualizations where:
- **X-axis**: Time (newest data on the right)
- **Y-axis**: Amplitude (height of the surface)
- **Z-axis**: Frequency (low frequencies at front, high at back)
- **Color**: Signal intensity using scientific colormaps

## ✨ Features

### 3D Visualization
- **Interactive 3D Scene**: Orbit, zoom, and pan controls
- **Real-time Updates**: Live audio stream processing
- **Smooth Animation**: 60 FPS rendering with damping
- **Dynamic Lighting**: Ambient and directional lighting

### Audio Input Options
- **Microphone**: Real-time capture from system microphone
- **File Upload**: Playback of audio files (WAV, MP3, etc.)
- **Automatic Detection**: Seamless switching between input sources

### Visualization Controls
- **Colormap Palettes**: 
  - Turbo (Google's scientific colormap)
  - Viridis (perceptually uniform)
  - Inferno (high contrast)
  - Jet (classic rainbow)
- **Gamma Correction**: Adjust color intensity mapping
- **Intensity Scaling**: Control overall visualization brightness
- **Frequency Range**: Limit displayed frequency range

### Technical Features
- **FFT Analysis**: Configurable FFT size (default 1024)
- **Frequency Binning**: Downsampling for smooth visualization
- **Time History**: Configurable history length (default 192 frames)
- **DC Blocking**: Automatic DC component removal
- **Smoothing**: Configurable time constant for smooth updates

## 🚀 Quick Start

### Prerequisites
- Modern web browser with Web Audio API support
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

### Basic Operation
1. **Start the application** in your browser
2. **Grant microphone permissions** when prompted
3. **Speak or play audio** to see the 3D visualization
4. **Use mouse controls** to navigate the 3D scene:
   - **Left click + drag**: Rotate view
   - **Right click + drag**: Pan view
   - **Scroll wheel**: Zoom in/out

### File Playback
1. **Click "Load Audio File"** button
2. **Select an audio file** (WAV, MP3, etc.)
3. **Visualization starts automatically** when playback begins
4. **File continues playing** while visualization updates

### Controls Panel
- **Colormap**: Select visualization color scheme
- **Gamma**: Adjust color intensity curve (0.5 - 2.0)
- **Intensity**: Control overall brightness (0.1 - 3.0)
- **Max Frequency**: Limit frequency range (Hz)

## 🔧 Configuration

### Default Settings
```typescript
{
  fftSize: 1024,           // FFT analysis size
  historyLength: 192,      // Number of time frames
  displayBinCount: 256,    // Frequency bins to display
  minDecibels: -90,        // Minimum signal level
  maxDecibels: -10,        // Maximum signal level
  heightScale: 0.018,      // Vertical scaling factor
  palette: 'turbo',        // Default colormap
  gamma: 1.0,              // Color gamma correction
  intensity: 1.0,          // Overall intensity
  maxFrequencyHz: 4000     // Maximum frequency to display
}
```

### Customization
You can modify the visualization parameters by editing the `visualiser.ts` file or by creating a new instance with custom options:

```typescript
const visualizer = new WaterfallSpectrogram(canvas, {
  fftSize: 2048,
  historyLength: 256,
  palette: 'viridis',
  gamma: 1.5,
  intensity: 1.2,
  maxFrequencyHz: 8000
});
```

## 🎨 Colormap Details

### Turbo
- **Origin**: Google's scientific colormap
- **Best for**: General purpose, high contrast
- **Colors**: Blue → Green → Yellow → Red

### Viridis
- **Origin**: Perceptually uniform colormap
- **Best for**: Scientific visualization
- **Colors**: Purple → Blue → Green → Yellow

### Inferno
- **Origin**: High contrast colormap
- **Best for**: Highlighting details
- **Colors**: Black → Red → Yellow → White

### Jet
- **Origin**: Classic rainbow colormap
- **Best for**: Traditional spectrograms
- **Colors**: Blue → Green → Yellow → Red

## 🔍 Technical Details

### Audio Processing Pipeline
1. **Audio Capture**: Web Audio API microphone or file input
2. **FFT Analysis**: Real-time frequency domain analysis
3. **Frequency Binning**: Downsample to display resolution
4. **Time History**: Maintain rolling buffer of frequency data
5. **3D Geometry**: Generate mesh vertices from frequency data
6. **Color Mapping**: Apply colormap to signal intensity
7. **Rendering**: Three.js WebGL rendering

### Performance Optimization
- **Efficient FFT**: Uses Web Audio API AnalyserNode
- **GPU Rendering**: WebGL-based 3D rendering
- **Memory Management**: Reuses geometry buffers
- **Frame Rate Control**: RequestAnimationFrame for smooth updates
- **Adaptive Quality**: Automatic pixel ratio adjustment

### Browser Compatibility
- **Chrome/Chromium**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Edge**: Full support

## 🛠️ Development

### Project Structure
```
3d-visualiser/
├── src/
│   ├── visualiser.ts      # Main visualization class
│   ├── main.ts           # Application entry point
│   └── style.css         # Styling
├── index.html            # HTML template
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

### Key Dependencies
- **Three.js**: 3D graphics library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool and dev server

### Adding New Features
1. **New Colormaps**: Add to `sampleColormap()` method
2. **Audio Effects**: Modify the audio processing pipeline
3. **UI Controls**: Add to the HTML and wire up event handlers
4. **3D Objects**: Add to the Three.js scene

## 🐛 Troubleshooting

### Common Issues

1. **No audio input**:
   - Check microphone permissions
   - Verify audio device is working
   - Try refreshing the page

2. **Poor performance**:
   - Reduce `historyLength` or `displayBinCount`
   - Lower `fftSize` for faster processing
   - Check browser hardware acceleration

3. **Visualization not updating**:
   - Check browser console for errors
   - Verify Web Audio API support
   - Try different audio input source

4. **3D controls not working**:
   - Ensure mouse events are not blocked
   - Check for conflicting JavaScript
   - Try different browser

### Debug Mode
Enable debug logging by opening browser developer tools and checking the console for detailed information about audio processing and rendering.

## 📄 License

This project is part of the microphone audio processing suite. See the main repository README for license information.

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional colormap options
- Audio effect processing
- Export functionality
- Mobile device optimization
- Performance enhancements
