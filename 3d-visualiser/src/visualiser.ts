import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type SpectrogramOptions = {
  fftSize?: number
  historyLength?: number
  displayBinCount?: number
  minDecibels?: number
  maxDecibels?: number
  heightScale?: number
  palette?: 'turbo' | 'viridis' | 'inferno' | 'jet'
  gamma?: number
  intensity?: number
  maxFrequencyHz?: number
}

export class WaterfallSpectrogram {
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>
  private controls: OrbitControls
  private timeAxisGroup: THREE.Group
  private animationFrameId: number | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private fileSource: AudioBufferSourceNode | null = null
  private mediaStream: MediaStream | null = null
  private disposed = false

  private options: Required<SpectrogramOptions>

  // Data buffers
  private cols: number
  private rows: number
  private heights: Float32Array
  private secondsShownEstimate = 0
  private lastNow: number | null = null
  private avgDeltaMs = 16.67
  private timeWidth = 17
  private freqDepth = 8
  private lastAxisSignature = ''
  private contextStartTime = 0
  private timeAxisTicks: { t: number, line: THREE.Line, level: 'major' | 'minor' | 'micro' }[] = []

  constructor(canvas: HTMLCanvasElement, options: SpectrogramOptions = {}) {
    this.canvas = canvas
    this.options = {
      fftSize: options.fftSize ?? 1024,
      historyLength: options.historyLength ?? 192,
      displayBinCount: options.displayBinCount ?? 256,
      minDecibels: options.minDecibels ?? -90,
      maxDecibels: options.maxDecibels ?? -10,
      heightScale: options.heightScale ?? 0.018,
      palette: options.palette ?? 'turbo',
      gamma: options.gamma ?? 1.0,
      intensity: options.intensity ?? 1.0,
      maxFrequencyHz: options.maxFrequencyHz ?? 4000,
    }

    this.cols = this.options.displayBinCount
    this.rows = this.options.historyLength
    this.heights = new Float32Array(this.cols * this.rows)
    this.secondsShownEstimate = (this.rows * this.avgDeltaMs) / 1000

    // Three.js setup
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000)
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    this.camera.position.set(0, 5.5, 10)
    this.camera.lookAt(0, 0, 0)

    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = true
    this.controls.target.set(0, 0.5, 0)

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    this.scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(2, 5, 3)
    this.scene.add(dir)

    // Grid mesh
    const geometry = this.createGridGeometry(this.cols, this.rows)
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.scene.add(this.mesh)

    // Time axis along the right side, slightly offset on +Z (front)
    this.timeAxisGroup = new THREE.Group()
    this.scene.add(this.timeAxisGroup)

    window.addEventListener('resize', this.handleResize)
    this.handleResize()

    // Initial render with silence so the screen is filled before audio starts
    this.updateGeometryFromHeights()
    this.rebuildTimeAxis()
    this.renderer.render(this.scene, this.camera)
  }

  private createGridGeometry(cols: number, rows: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()

    const positions = new Float32Array(cols * rows * 3)
    const colors = new Float32Array(cols * rows * 3)
    const indices: number[] = []

    // We want time to move from right -> left across X.
    // rows represent time history, cols represent frequency bins.
    const dx = this.timeWidth / (rows - 1) // step along X for time
    const dz = this.freqDepth / (cols - 1)  // step along Z for frequency

    let p = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Place newest data (r=0) at the right edge (positive X)
        const x = this.timeWidth / 2 - r * dx
        const y = 0
        // Center frequencies around Z=0 with low freq at front (positive Z)
        const z = this.freqDepth / 2 - c * dz
        positions[p] = x
        positions[p + 1] = y
        positions[p + 2] = z
        // initialize colors to cool blue
        const col = new THREE.Color().setHSL(0.7, 1, 0.2)
        colors[p] = col.r
        colors[p + 1] = col.g
        colors[p + 2] = col.b
        p += 3
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        const b = a + 1
        const d = (r + 1) * cols + c
        const e = d + 1
        indices.push(a, d, b, b, d, e)
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  private handleResize = () => {
    const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || window.innerHeight
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('Instance disposed')
    if (this.animationFrameId) return

    // Audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false })
    this.mediaStream = stream
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    this.audioContext = audioContext
    this.contextStartTime = audioContext.currentTime
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = this.options.fftSize
    analyser.minDecibels = this.options.minDecibels
    analyser.maxDecibels = this.options.maxDecibels
    analyser.smoothingTimeConstant = 0.8
    this.analyser = analyser

    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)
    // Pre-fill with silence for a full-screen surface before audio arrives
    this.lastNow = performance.now()
    this.heights.fill(0)
    this.updateGeometryFromHeights()
    this.rebuildTimeAxis()
    this.renderer.render(this.scene, this.camera)

    this.loop()
  }

  async startWithFile(file: File): Promise<void> {
    if (this.disposed) throw new Error('Instance disposed')
    if (this.animationFrameId) this.stop()
    const arrayBuf = await file.arrayBuffer()
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    this.audioContext = audioContext
    this.contextStartTime = audioContext.currentTime
    const buffer = await audioContext.decodeAudioData(arrayBuf)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = this.options.fftSize
    analyser.minDecibels = this.options.minDecibels
    analyser.maxDecibels = this.options.maxDecibels
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    analyser.connect(audioContext.destination)
    this.analyser = analyser
    this.fileSource = source
    source.start(0)
    source.onended = () => {
      // Keep the visualizer running; zero incoming rows (silence)
      this.fileSource = null
      // Leave analyser in place; loop() will just draw silence until a new file/mic starts
    }
    // Pre-fill with silence for a full-screen surface before playback
    this.lastNow = performance.now()
    this.heights.fill(0)
    this.updateGeometryFromHeights()
    this.rebuildTimeAxis()
    this.renderer.render(this.scene, this.camera)

    this.loop()
  }

  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop())
      this.mediaStream = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  dispose(): void {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
    this.renderer.dispose()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.controls.dispose()
    this.disposed = true
  }

  private loop = (now: number) => {
    if (!this.analyser) return
    const analyser = this.analyser

    const bins = analyser.frequencyBinCount
    const raw = new Uint8Array(bins)
    analyser.getByteFrequencyData(raw)

    // Downsample to display bins
    const cols = this.cols
    const nyquist = (this.audioContext?.sampleRate ?? 44100) / 2
    const maxBin = Math.max(1, Math.min(bins, Math.floor((this.options.maxFrequencyHz / nyquist) * bins)))
    const step = maxBin / cols
    const newRow = new Float32Array(cols)
    for (let i = 0; i < cols; i++) {
      // average over the window for smoother result
      const start = Math.floor(i * step)
      const end = Math.floor((i + 1) * step)
      let sum = 0
      let count = 0
      for (let j = start; j < end; j++) {
        sum += raw[j]
        count++
      }
      const v = count > 0 ? sum / (count * 255) : raw[Math.floor(i * step)] / 255
      newRow[i] = v
    }

    // shift history back by one row
    this.heights.copyWithin(cols, 0, cols * (this.rows - 1))
    this.heights.set(newRow, 0)

    // Update seconds estimate
    const frameRate = 60 // approximate; controlled by rAF
    const secondsShown = (this.rows / frameRate)
    this.secondsShownEstimate = secondsShown

    this.updateGeometryFromHeights()
    this.rebuildTimeAxis()

    // timing
    if (this.lastNow != null) {
      const dt = now - this.lastNow
      this.avgDeltaMs = this.avgDeltaMs * 0.9 + dt * 0.1
      this.secondsShownEstimate = (this.rows * this.avgDeltaMs) / 1000
    }
    this.lastNow = now

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.animationFrameId = requestAnimationFrame(this.loop)
  }

  getSecondsShown(): number { return this.secondsShownEstimate }

  private updateGeometryFromHeights(): void {
    const positions = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const hs = this.heights
    const hScale = this.options.heightScale * this.options.intensity
    let pi = 0
    let ci = 0
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // y component lives at index + 1
        const idx = r * this.cols + c
        positions.array[pi + 1] = hs[idx] * hScale * 25

        const col = this.sampleColormap(Math.pow(hs[idx], this.options.gamma))
        colors.array[ci] = col.r
        colors.array[ci + 1] = col.g
        colors.array[ci + 2] = col.b

        pi += 3
        ci += 3
      }
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
  }

  private rebuildTimeAxis(): void {
    const secondsShown = this.secondsShownEstimate
    const nowSec = this.getElapsedSeconds()
    const majorStep = 1.0
    const minorStep = 0.5
    const microStep = 0.1
    const signatureBucket = Math.floor(nowSec / (microStep * 0.2))
    const signature = `${Math.round(secondsShown * 100)}-${signatureBucket}`
    if (signature === this.lastAxisSignature) {
      // Just update positions for smooth scrolling
      const pxPerSec = this.timeWidth / secondsShown
      const z = this.freqDepth / 2 + 0.05
      for (const tick of this.timeAxisTicks) {
        const offset = nowSec - tick.t
        const x = this.timeWidth / 2 - offset * pxPerSec
        tick.line.position.set(x, 0, z)
      }
      return
    }
    this.lastAxisSignature = signature

    // rebuild set of ticks in range
    // remove old
    while (this.timeAxisGroup.children.length) this.timeAxisGroup.remove(this.timeAxisGroup.children[0])
    this.timeAxisTicks = []

    const pxPerSec = this.timeWidth / secondsShown
    const z = this.freqDepth / 2 + 0.05
    const majorGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.3)])
    const minorGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.2)])
    const microGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.1)])
    const majorMat = new THREE.LineBasicMaterial({ color: 0xffffff })
    const minorMat = new THREE.LineBasicMaterial({ color: 0xcccccc })
    const microMat = new THREE.LineBasicMaterial({ color: 0x777777 })

    const start = Math.ceil((nowSec - secondsShown) / microStep) * microStep
    for (let t = start; t <= nowSec + 1e-6; t += microStep) {
      const isMajor = Math.abs((t / majorStep) - Math.round(t / majorStep)) < 1e-6
      const isMinor = !isMajor && Math.abs((t / minorStep) - Math.round(t / minorStep)) < 1e-6
      const level: 'major' | 'minor' | 'micro' = isMajor ? 'major' : isMinor ? 'minor' : 'micro'
      const geom = level === 'major' ? majorGeom : level === 'minor' ? minorGeom : microGeom
      const mat = level === 'major' ? majorMat : level === 'minor' ? minorMat : microMat
      const offset = nowSec - t
      const x = this.timeWidth / 2 - offset * pxPerSec
      const ln = new THREE.Line(geom, mat)
      ln.position.set(x, 0, z)
      this.timeAxisGroup.add(ln)
      this.timeAxisTicks.push({ t, line: ln, level })
    }
  }

  private makeTextSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const pad = 8
    ctx.font = '28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto'
    const metrics = ctx.measureText(text)
    canvas.width = Math.max(64, Math.ceil(metrics.width) + pad * 2)
    canvas.height = 40
    const ctx2 = canvas.getContext('2d')!
    ctx2.font = ctx.font
    ctx2.fillStyle = 'rgba(0,0,0,0.35)'
    ctx2.fillRect(0, 0, canvas.width, canvas.height)
    ctx2.fillStyle = '#ffffff'
    ctx2.textBaseline = 'middle'
    ctx2.fillText(text, pad, canvas.height / 2)
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
    return new THREE.Sprite(mat)
  }

  getElapsedSeconds(): number {
    if (this.audioContext) {
      return Math.max(0, this.audioContext.currentTime - this.contextStartTime)
    }
    // fallback to rAF time
    return ((performance.now() - (this.lastNow ?? performance.now())) / 1000)
  }

  private niceStep(step: number): number {
    const pow10 = Math.pow(10, Math.floor(Math.log10(step)))
    const n = step / pow10
    let m = 1
    if (n > 5) m = 10
    else if (n > 2) m = 5
    else if (n > 1) m = 2
    return m * pow10
  }

  setPalette(palette: 'turbo' | 'viridis' | 'inferno' | 'jet'): void {
    this.options.palette = palette
  }

  setGamma(gamma: number): void {
    this.options.gamma = gamma
  }

  setIntensity(intensity: number): void {
    this.options.intensity = intensity
  }

  setMaxFrequencyHz(hz: number): void {
    this.options.maxFrequencyHz = hz
  }

  private sampleColormap(t: number): THREE.Color {
    const x = Math.max(0, Math.min(1, t))
    switch (this.options.palette) {
      case 'viridis':
        return this.sampleViridis(x)
      case 'inferno':
        return this.sampleInferno(x)
      case 'jet':
        return this.sampleJet(x)
      case 'turbo':
      default:
        return this.sampleTurbo(x)
    }
  }

  // Exact Turbo from Google (approx via polynomial fit)
  private sampleTurbo(x: number): THREE.Color {
    const r = 0.13572138 + 4.61539260 * x - 42.66032258 * x**2 + 132.13108234 * x**3 - 152.94239396 * x**4 + 59.28637943 * x**5
    const g = 0.09140261 + 2.19418839 * x + 4.84296658 * x**2 - 14.18503333 * x**3 + 4.27729857 * x**4 + 2.82956604 * x**5
    const b = 0.10667330 + 11.60103677 * x - 41.92415440 * x**2 + 54.80615188 * x**3 - 25.07564636 * x**4 + 2.40923504 * x**5
    return new THREE.Color(this.clamp01(r), this.clamp01(g), this.clamp01(b))
  }

  private sampleViridis(x: number): THREE.Color {
    // simple piecewise approximation
    const r = this.clamp01(-0.5 + 2.4 * x - 2.1 * x**2)
    const g = this.clamp01(0.3 + 1.3 * x)
    const b = this.clamp01(0.8 - 0.8 * x + 0.4 * x**2)
    return new THREE.Color(r, g, b)
  }

  private sampleInferno(x: number): THREE.Color {
    const r = this.clamp01(Math.pow(x, 0.7))
    const g = this.clamp01(0.2 + 1.5 * x - x**2)
    const b = this.clamp01(0.01 + 0.8 * x - 0.8 * x**2)
    return new THREE.Color(r, g, b)
  }

  private sampleJet(x: number): THREE.Color {
    const r = this.clamp01(1.5 - Math.abs(4 * x - 3))
    const g = this.clamp01(1.5 - Math.abs(4 * x - 2))
    const b = this.clamp01(1.5 - Math.abs(4 * x - 1))
    return new THREE.Color(r, g, b)
  }

  private clamp01(v: number): number { return Math.max(0, Math.min(1, v)) }
}


