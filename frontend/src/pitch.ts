export type PitchResult = { freqHz: number|null; confidence: number; cents: number|null; note: string|null };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function detectPitchAutocorrPCM16(pcm: Int16Array, sampleRate: number, fMin = 50, fMax = 1200): PitchResult {
  if (pcm.length < 512) return { freqHz: null, confidence: 0, cents: null, note: null };
  // Normalize to float
  const N = pcm.length;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = pcm[i] / 32768;

  // Remove DC (simple high-pass)
  let mean = 0; for (let i = 0; i < N; i++) mean += buf[i]; mean /= N;
  for (let i = 0; i < N; i++) buf[i] -= mean;

  // Autocorrelation
  const maxLag = Math.floor(sampleRate / fMin);
  const minLag = Math.max(1, Math.floor(sampleRate / fMax));
  const ac = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += buf[i] * buf[i + lag];
    ac[lag] = sum;
  }
  // Find best peak after zero-lag region
  let bestLag = -1; let bestVal = 0;
  for (let lag = minLag + 1; lag < maxLag - 1; lag++) {
    const v = ac[lag];
    if (v > ac[lag - 1] && v >= ac[lag + 1] && v > bestVal) { bestVal = v; bestLag = lag; }
  }
  if (bestLag < 0) return { freqHz: null, confidence: 0, cents: null, note: null };
  // Parabolic interpolation around the peak
  const y1 = ac[bestLag - 1];
  const y2 = ac[bestLag];
  const y3 = ac[bestLag + 1];
  const denom = (y1 - 2*y2 + y3) || 1e-12;
  const delta = 0.5 * (y1 - y3) / denom; // shift in [-0.5,0.5]
  const refinedLag = bestLag + delta;
  const freq = sampleRate / refinedLag;

  // Confidence: normalized peak vs zero-lag energy
  let energy = 0; for (let i = 0; i < N; i++) energy += buf[i]*buf[i];
  const conf = Math.max(0, Math.min(1, bestVal / (energy + 1e-9)));

  const midi = 69 + 12 * Math.log2(freq / 440);
  const noteIdx = Math.round(midi);
  const cents = (midi - noteIdx) * 100;
  const octave = Math.floor(noteIdx / 12) - 1;
  const name = NOTE_NAMES[((noteIdx % 12) + 12) % 12] + octave;
  return { freqHz: freq, confidence: conf, cents, note: name };
}

export function drawTunerGauge(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, cents: number|null, conf: number, note: string|null, freqHz: number|null) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  // Gauge background
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
  // Marks at -50..+50 cents
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let c=-50; c<=50; c+=10){ const x = (w/2) + (c/50) * (w*0.45); ctx.fillRect(x-0.5, h/2-6, 1, 12); }
  // Needle
  if (cents!=null){
    const limited = Math.max(-50, Math.min(50, cents));
    const x = (w/2) + (limited/50) * (w*0.45);
    const col = Math.abs(limited) < 5 ? '#22c55e' : (Math.abs(limited) < 15 ? '#f59e0b' : '#ef4444');
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w/2, h/2); ctx.lineTo(x, h/2); ctx.stroke();
  }
  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center';
  const label = note && freqHz ? `${note}  ${freqHz.toFixed(1)} Hz` : '—';
  ctx.fillText(label, w/2, h/2 - 18);
  // Confidence bar
  const barW = Math.max(1, Math.floor(w * 0.6 * Math.max(0.05, conf)));
  ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
  ctx.fillRect((w - barW)/2, h - 18, barW, 6);
}


