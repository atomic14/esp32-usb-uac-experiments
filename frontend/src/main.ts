import { PacketParser } from './parser';
import { resizeCanvasToDpr, drawScope, drawSpectrogram } from './visuals';
import { int16ToWavBlob } from './wav';
import { requestAndOpen, closeCurrentPort } from './serial';
import { createMicReader } from './mic';
import { BarSpectrum } from './spectrum';
import { detectPitchAutocorrPCM16, drawTunerGauge } from './pitch';

const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const sourceSelect = document.getElementById('sourceSelect') as HTMLSelectElement | null;
const micPickerWrap = document.getElementById('micPickerWrap') as HTMLLabelElement | null;
const micSelect = document.getElementById('micSelect') as HTMLSelectElement | null;
const scopeCanvas = document.getElementById('scope') as HTMLCanvasElement;
const specCanvas = document.getElementById('spec') as HTMLCanvasElement;
const barsCanvas = document.getElementById('bars') as HTMLCanvasElement;
const tunerCanvas = document.getElementById('tuner') as HTMLCanvasElement;
const scopeStatus = document.getElementById('scopeStatus') as HTMLDivElement;
const samplerateEl = document.getElementById('samplerate') as HTMLInputElement;
const colormapEl = document.getElementById('colormap') as HTMLSelectElement;
const crcCheckEl = document.getElementById('crcCheck') as HTMLInputElement;
const scopeGainEl = document.getElementById('scopeGain') as HTMLInputElement;
const scopeGainVal = document.getElementById('scopeGainVal') as HTMLSpanElement;
const startRecBtn = document.getElementById('startRecBtn') as HTMLButtonElement;
const stopRecBtn = document.getElementById('stopRecBtn') as HTMLButtonElement;
const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
const debugStats = document.getElementById('debugStats') as HTMLDivElement;
const debugLog = document.getElementById('debugLog') as HTMLPreElement;
const clearLogBtn = document.getElementById('clearLogBtn') as HTMLButtonElement;
const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement;
const helpModal = document.getElementById('helpModal') as HTMLDivElement;
const helpCloseBtn = document.getElementById('helpCloseBtn') as HTMLButtonElement;

const scopeCtx = scopeCanvas.getContext('2d')!;
const specCtx = specCanvas.getContext('2d')!;
const barsCtx = barsCanvas.getContext('2d')!;
const wsSupport = document.getElementById('wsSupport') as HTMLSpanElement;
const connState = document.getElementById('connState') as HTMLSpanElement;
const bpsChip = document.getElementById('bpsChip') as HTMLSpanElement;
const pktChip = document.getElementById('pktChip') as HTMLSpanElement;
const crcChip = document.getElementById('crcChip') as HTMLSpanElement;
const vuFill = document.getElementById('vuFill') as HTMLSpanElement;
const noteEl = document.getElementById('note') as HTMLSpanElement;
const pitchHzEl = document.getElementById('pitchHz') as HTMLSpanElement;
const pitchConfEl = document.getElementById('pitchConf') as HTMLSpanElement;
function resizeAll(){
  resizeCanvasToDpr(scopeCanvas, scopeCtx);
  resizeCanvasToDpr(specCanvas, specCtx);
  resizeCanvasToDpr(barsCanvas, barsCtx);
  const tunerCtx = tunerCanvas.getContext('2d'); if (tunerCtx) { resizeCanvasToDpr(tunerCanvas, tunerCtx); }
}
resizeAll();
window.addEventListener('resize', resizeAll);

let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
const mic = createMicReader();
let sourceMode: 'serial' | 'mic' = 'mic';
let selectedMicId: string | undefined;
let bytesWindow = 0;
let lastBpsTs = performance.now();
let recordingActive = false;
let recordingChunks: Int16Array[] = [];

// Calibrate so near-silence idles low but not zero; speech/music rise clearly
const barSpec = new BarSpectrum(barsCanvas, { bands: 31, fftSize: 1024, minDb: -80, maxDb: 0, peakHoldDecayDbPerSec: 12, levelDecayDbPerSec: 50, segments: 28, segmentGapPx: 2, glow: true });

const parser = new PacketParser(() => crcCheckEl.checked, onPcm, (m)=>log(m));

let pktCount = 0;
let lastPktTs = 0;
let crcErrors = 0;
let bps = 0;
// VU meter state (true-RMS with ~50 ms time constant)
let vuRms2 = 0; // running mean-square in 0..1
const VU_TAU_SEC = 0.05;
const VU_MIN_DB = -80; // floor

function onPcm(pcm: Int16Array) {
  pktCount++;
  lastPktTs = performance.now();
  if ((pktCount & 0x3F) === 0) debugStats.textContent = `packets: ${pktCount}`;
  const gain = scopeGainEl ? Number(scopeGainEl.value) : 1;
  if (scopeGainVal) scopeGainVal.textContent = `${gain.toFixed(2)}×`;
  drawScope(scopeCtx, scopeCanvas, pcm, gain);
  const sr = sourceMode === 'mic' ? (mic.getSampleRate() || Number(samplerateEl.value) || 48000) : (Number(samplerateEl.value) || 48000);
  drawSpectrogram(specCtx, specCanvas, pcm, sr, (colormapEl?.value as any) || 'turbo');
  // update classic spectrum
  const now = performance.now();
  const dt = 16 / 1000; // approx frame delta; fine for smoothing
  barSpec.update(pcm, sr, dt);
  barSpec.draw();
  // Pitch detection and tuner draw
  const pitch = detectPitchAutocorrPCM16(pcm, sr);
  noteEl.textContent = pitch.note ?? '—';
  pitchHzEl.textContent = pitch.freqHz ? pitch.freqHz.toFixed(1) + '' : '— Hz';
  pitchConfEl.textContent = pitch.confidence.toFixed(2);
  const tctx = tunerCanvas.getContext('2d'); if (tctx) drawTunerGauge(tctx, tunerCanvas, pitch.cents, pitch.confidence, pitch.note, pitch.freqHz);
  // --- VU update ---
  let sumSq = 0;
  for (let i = 0; i < pcm.length; i++) { const v = pcm[i] / 32768; sumSq += v * v; }
  const meanSq = sumSq / Math.max(1, pcm.length);
  const chunkDt = pcm.length / Math.max(1, sr);
  const alpha = Math.exp(-chunkDt / VU_TAU_SEC);
  vuRms2 = alpha * vuRms2 + (1 - alpha) * meanSq;
  const rms = Math.sqrt(vuRms2 + 1e-12);
  const db = 20 * Math.log10(rms + 1e-12);
  const vuNorm = Math.min(1, Math.max(0, (db - VU_MIN_DB) / (0 - VU_MIN_DB)));
  vuFill.style.width = (vuNorm * 100).toFixed(0) + '%';
  if (recordingActive) recordingChunks.push(pcm);
}

connectBtn.addEventListener('click', async () => {
  sourceMode = (sourceSelect?.value as any) || 'serial';
  if (sourceMode === 'serial') {
    reader = await requestAndOpen(115200);
    if (!reader) return;
    log('Serial port opened at 115200 baud');
    connectBtn.disabled = true; disconnectBtn.disabled = false; startRecBtn.disabled = false;
    connState.textContent = 'Connected';
    connState.className = 'chip ok';
    samplerateEl.disabled = false; crcCheckEl.disabled = false;
    readLoop();
  } else {
    try {
      const sr = Number(samplerateEl.value) || 48000;
      await mic.start(sr, onPcm, selectedMicId);
      connectBtn.disabled = true; disconnectBtn.disabled = false; startRecBtn.disabled = false;
      connState.textContent = 'Mic active';
      connState.className = 'chip ok';
      // CRC not applicable for mic, and samplerate may be locked by device
      crcCheckEl.checked = false; crcCheckEl.disabled = true;
      samplerateEl.disabled = false; // allow changing; will recreate context on next connect
      wsSupport.textContent = 'Microphone'; wsSupport.className = 'chip ok';
      log('Microphone capture started');
    } catch (e) {
      log('Mic error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
});

disconnectBtn.addEventListener('click', async () => {
  if (sourceMode === 'serial') {
    try { await reader?.cancel(); reader?.releaseLock(); } catch {}
    try { await closeCurrentPort(); } catch {}
    log('Serial port closed');
    reader = null;
  } else {
    try { await mic.stop(); } catch {}
    log('Microphone stopped');
  }
  connectBtn.disabled = false; disconnectBtn.disabled = true; startRecBtn.disabled = true; stopRecBtn.disabled = true; downloadBtn.disabled = true;
  connState.textContent = 'Disconnected';
  connState.className = 'chip bad';
  wsSupport.textContent = ('serial' in navigator) ? 'WebSerial: available' : 'WebSerial: not supported';
  wsSupport.className = ('serial' in navigator) ? 'chip ok' : 'chip bad';
});

startRecBtn.addEventListener('click', () => {
  recordingActive = true; recordingChunks = [];
  startRecBtn.disabled = true; stopRecBtn.disabled = false; downloadBtn.disabled = true;
});

stopRecBtn.addEventListener('click', () => {
  recordingActive = false;
  startRecBtn.disabled = false; stopRecBtn.disabled = true;
  const totalLen = recordingChunks.reduce((a, b) => a + b.length, 0);
  const merged = new Int16Array(totalLen);
  let o = 0; for (const c of recordingChunks) { merged.set(c, o); o += c.length; }
  const useSr = sourceMode === 'mic' ? (mic.getSampleRate() || Number(samplerateEl.value)) : Number(samplerateEl.value);
  const blob = int16ToWavBlob(merged, useSr);
  const url = URL.createObjectURL(blob);
  downloadBtn.disabled = false;
  downloadBtn.onclick = () => { const a = document.createElement('a'); a.href = url; a.download = 'recording.wav'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
});

async function readLoop(){
  if (!reader) return;
  while (reader) {
    try {
      const { value, done } = await reader.read();
      if (done) { log('Reader done'); break; }
      if (!value) { continue; }
      bytesWindow += value.length;
      const now = performance.now();
      if (now - lastBpsTs >= 1000) {
        bps = bytesWindow; bytesWindow = 0; lastBpsTs = now;
        const kb = (bps/1024).toFixed(1) + ' kB/s';
        scopeStatus.textContent = kb; bpsChip.textContent = kb;
      }
      parser.append(value);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('Read error: ' + msg);
      if (/break/i.test(msg)) { await new Promise(r=>setTimeout(r,50)); continue; }
      break;
    }
  }
}

function log(msg: string) {
  const ts = new Date().toISOString().split('T')[1].replace('Z','');
  debugLog.textContent += `[${ts}] ${msg}\n`;
  debugLog.scrollTop = debugLog.scrollHeight;
}

clearLogBtn?.addEventListener('click', () => { debugLog.textContent = ''; });

// Help modal wiring
helpBtn?.addEventListener('click', () => {
  if (helpModal) helpModal.style.display = 'flex';
});
helpCloseBtn?.addEventListener('click', () => {
  if (helpModal) helpModal.style.display = 'none';
});
helpModal?.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.style.display = 'none';
});

// WebSerial support badge
if ('serial' in navigator) { wsSupport.textContent = 'WebSerial: available'; wsSupport.className = 'chip ok'; }
else { wsSupport.textContent = 'WebSerial: not supported'; wsSupport.className = 'chip bad'; }
// If mic is default, reveal and pre-populate mic list
if (sourceSelect && sourceSelect.value === 'mic') {
  if (micPickerWrap) micPickerWrap.style.display = '';
  (async ()=>{ try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}; await refreshMicList(); })();
}

// Periodic chip refresh (packets/CRC)
setInterval(()=>{
  pktChip.textContent = `${pktCount} pkts`;
  crcChip.textContent = `CRC: ${crcErrors}`;
}, 250);
// Populate microphone list when switching to mic mode
async function refreshMicList() {
  if (!micSelect) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    const prev = micSelect.value;
    micSelect.innerHTML = '';
    const def = document.createElement('option'); def.value = ''; def.textContent = 'Default'; micSelect.appendChild(def);
    for (const d of mics) {
      const opt = document.createElement('option');
      opt.value = d.deviceId; opt.textContent = d.label || `Mic ${micSelect.options.length}`;
      micSelect.appendChild(opt);
    }
    micSelect.value = prev;
  } catch (e) {
    log('enumerateDevices error: ' + (e instanceof Error ? e.message : String(e)));
  }
}

sourceSelect?.addEventListener('change', async () => {
  const val = sourceSelect.value as 'serial'|'mic';
  if (micPickerWrap) micPickerWrap.style.display = val === 'mic' ? '' : 'none';
  if (val === 'mic') {
    try {
      // Request mic permission to reveal labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {}
    await refreshMicList();
  }
});

micSelect?.addEventListener('change', () => {
  selectedMicId = micSelect.value || undefined;
});



