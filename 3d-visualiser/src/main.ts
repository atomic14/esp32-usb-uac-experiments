import './style.css'
import { WaterfallSpectrogram } from './visualiser'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="container">
    <div class="controls">
      <button id="start">Start microphone</button>
      <button id="stop" disabled>Stop</button>
      <button id="open">Open audio…</button>
      <input id="file" type="file" accept="audio/*" style="display:none" />
      <label>
        Palette
        <select id="palette">
          <option value="turbo" selected>Turbo</option>
          <option value="viridis">Viridis</option>
          <option value="inferno">Inferno</option>
          <option value="jet">Jet</option>
        </select>
      </label>
      <label>
        Gamma
        <input id="gamma" type="range" min="0.3" max="2.0" step="0.05" value="0.9" />
      </label>
      <label>
        Intensity
        <input id="intensity" type="range" min="0.5" max="2.0" step="0.05" value="1.0" />
      </label>
      <label>
        Max Freq (kHz)
        <input id="maxfreq" type="range" min="1" max="16" step="0.5" value="4" />
      </label>
    </div>
    <canvas id="scene"></canvas>
    <div class="hint">Grant mic access to see the spectrum.</div>
    <div id="timescale" class="timescale">
      <div class="axis"></div>
    </div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const startBtn = document.querySelector<HTMLButtonElement>('#start')!
const stopBtn = document.querySelector<HTMLButtonElement>('#stop')!
const openBtn = document.querySelector<HTMLButtonElement>('#open')!
const fileInput = document.querySelector<HTMLInputElement>('#file')!
const paletteSelect = document.querySelector<HTMLSelectElement>('#palette')!
const gammaInput = document.querySelector<HTMLInputElement>('#gamma')!
const intensityInput = document.querySelector<HTMLInputElement>('#intensity')!
const maxFreqInput = document.querySelector<HTMLInputElement>('#maxfreq')!
const timeScaleEl = document.querySelector<HTMLDivElement>('#timescale')!

const spectrogram = new WaterfallSpectrogram(canvas, {
  fftSize: 1024,
  historyLength: 200,
  displayBinCount: 256,
  palette: 'turbo',
  gamma: 0.9,
  intensity: 1.0,
  maxFrequencyHz: 4000,
})

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true
  try {
    await spectrogram.start()
    stopBtn.disabled = false
  } catch (err) {
    console.error(err)
    startBtn.disabled = false
  }
})

stopBtn.addEventListener('click', () => {
  spectrogram.stop()
  stopBtn.disabled = true
  startBtn.disabled = false
})

window.addEventListener('beforeunload', () => spectrogram.dispose())

openBtn.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  startBtn.disabled = true
  stopBtn.disabled = false
  await spectrogram.startWithFile(file)
  // Reset input so selecting the same file again fires 'change'
  fileInput.value = ''
})

paletteSelect.addEventListener('change', () => {
  spectrogram.setPalette(paletteSelect.value as any)
})

gammaInput.addEventListener('input', () => {
  spectrogram.setGamma(parseFloat(gammaInput.value))
})

intensityInput.addEventListener('input', () => {
  spectrogram.setIntensity(parseFloat(intensityInput.value))
})

maxFreqInput.addEventListener('input', () => {
  const khz = parseFloat(maxFreqInput.value)
  spectrogram.setMaxFrequencyHz(khz * 1000)
})

function rebuildTimeScale() {
  // Clear
  timeScaleEl.querySelectorAll('.tick, .label').forEach(n => n.remove())
  const secondsShown = spectrogram.getSecondsShown()
  if (secondsShown <= 0) return
  const axis = timeScaleEl.querySelector('.axis') as HTMLDivElement
  const axisWidth = axis.clientWidth || timeScaleEl.clientWidth
  const pxPerSec = axisWidth / secondsShown
  const step = niceStep(secondsShown / 8)
  for (let t = 0; t <= secondsShown + 1e-6; t += step) {
    const x = 8 + t * pxPerSec
    const tick = document.createElement('div')
    tick.className = 'tick'
    tick.style.left = `${x}px`
    timeScaleEl.appendChild(tick)

    const label = document.createElement('div')
    label.className = 'label'
    label.style.left = `${x}px`
    label.textContent = `${t.toFixed(t < 1 ? 1 : 0)}s`
    timeScaleEl.appendChild(label)
  }
}

function niceStep(step: number): number {
  const pow10 = Math.pow(10, Math.floor(Math.log10(step)))
  const n = step / pow10
  let m = 1
  if (n > 5) m = 10
  else if (n > 2) m = 5
  else if (n > 1) m = 2
  return m * pow10
}

rebuildTimeScale()
window.addEventListener('resize', rebuildTimeScale)
