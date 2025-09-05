import { hann, fftRadix2 } from './fft';

export function resizeCanvasToDpr(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function drawScope(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, pcm: Int16Array, gain = 1): void {
  const rect = canvas.getBoundingClientRect();
  const wCss = Math.max(1, Math.floor(rect.width));
  const hCss = Math.max(1, Math.floor(rect.height));
  ctx.clearRect(0, 0, wCss, hCss);
  ctx.strokeStyle = '#5df';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const mid = hCss / 2;
  const denom = Math.max(1, wCss - 1);
  const srcLenMinus1 = Math.max(0, pcm.length - 1);
  for (let x = 0; x < wCss; x++) {
    const i = Math.floor((x / denom) * srcLenMinus1);
    const v = ((pcm[i] ?? 0) / 32768) * gain;
    const y = mid - v * (hCss * 0.48);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Turbo colormap (approximation). t in [0,1]
function turboColorRGB(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * (0.13572138 + 4.61539260*t - 42.66032258*t*t + 132.13108234*t*t*t - 152.94239396*t*t*t*t + 59.28637943*t*t*t*t*t));
  const g = Math.round(255 * (0.09140261 + 2.19418839*t + 4.84296658*t*t - 14.18503333*t*t*t + 4.27729857*t*t*t*t + 2.82956604*t*t*t*t*t));
  const b = Math.round(255 * (0.10667330 + 12.64194608*t - 60.58204836*t*t + 110.36276771*t*t*t - 62.74135369*t*t*t*t + 13.01240956*t*t*t*t*t));
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b))
  ];
}

function viridisColorRGB(t: number): [number, number, number] {
  // Minimal approximation of Viridis using piecewise polynomials
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * (0.280 + 0.720 * Math.pow(t, 1.5)));
  const g = Math.round(255 * Math.max(0, Math.min(1, -0.10 + 1.20 * t - 0.20 * t*t)));
  const b = Math.round(255 * (0.35 + 0.65 * (1 - Math.pow(t, 1.2))));
  return [r, g, b];
}

function infernoColorRGB(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * Math.min(1, Math.max(0, Math.pow(t, 1.2))));
  const g = Math.round(255 * Math.min(1, Math.max(0, Math.pow(t, 3))));
  const b = Math.round(255 * Math.min(1, Math.max(0, Math.pow(1 - t, 1.5))));
  return [r, g, b];
}

function greysColorRGB(t: number): [number, number, number] {
  const v = Math.round(255 * Math.max(0, Math.min(1, t)));
  return [v, v, v];
}

export function drawSpectrogram(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pcm: Int16Array,
  sampleRate: number,
  palette: 'turbo'|'viridis'|'inferno'|'greys' = 'turbo'
): void {
  const nfft = 1024;
  const step = Math.max(1, Math.floor(pcm.length / nfft));
  const re = new Float32Array(nfft);
  const im = new Float32Array(nfft);
  const win = hann(nfft);
  for (let i = 0; i < nfft; i++) {
    const srcIdx = Math.min(pcm.length - 1, i * step);
    const s = pcm.length > 0 ? (pcm[srcIdx] ?? 0) : 0;
    re[i] = (s / 32768) * win[i];
  }
  fftRadix2(re, im);

  // dBFS scaling with Hann coherent gain
  let sumWin = 0; for (let i = 0; i < nfft; i++) sumWin += win[i];
  const coherentGain = sumWin / nfft; // ~0.5
  const scale = 2 / (nfft * coherentGain + 1e-12);
  const bins = nfft >> 1;
  const magDb = new Float32Array(bins);
  for (let k = 0; k < bins; k++) magDb[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) * scale + 1e-12);

  const MIN_DB = -100, MAX_DB = 0;
  const specWidth = canvas.width, specHeight = canvas.height;
  // scroll left
  ctx.drawImage(canvas, 1, 0, specWidth - 1, specHeight, 0, 0, specWidth - 1, specHeight);
  // draw rightmost column via ImageData for speed
  const column = ctx.createImageData(1, specHeight);
  const data = column.data;
  const nyquist = Math.max(1, sampleRate / 2);
  const F_MIN = 50; // Hz floor for display (avoid DC dominance)
  const fMin = Math.min(nyquist * 0.9, Math.max(1, F_MIN));
  const logDen = Math.log(nyquist / fMin + 1e-12);

  for (let y = 0; y < specHeight; y++) {
    // Bottom low, top high with true log frequency scaling
    const yTop = y / (specHeight - 1);    // 0 at top, 1 at bottom
    const yBottom = 1 - yTop;             // 0 at bottom? actually 0 at top; bottom=1
    const f = fMin * Math.exp(yBottom * logDen); // f in [fMin, nyquist]
    const k = Math.min(bins - 1, Math.floor((f / nyquist) * (bins - 1)));
    // neighborhood average for smoothing
    let db = 0; let cnt = 0; for (let o = -1; o <= 1; o++){ const kk = k + o; if (kk>=0 && kk<bins){ db += magDb[kk]; cnt++; }}
    db /= Math.max(1, cnt);
    const n = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
    let rgb: [number, number, number];
    switch (palette) {
      case 'viridis': rgb = viridisColorRGB(n); break;
      case 'inferno': rgb = infernoColorRGB(n); break;
      case 'greys': rgb = greysColorRGB(n); break;
      default: rgb = turboColorRGB(n); break;
    }
    const o4 = y * 4; // top row index (no vertical flip; top shows low freqs)
    data[o4]=rgb[0]; data[o4+1]=rgb[1]; data[o4+2]=rgb[2]; data[o4+3]=255;
  }
  ctx.putImageData(column, specWidth - 1, 0);
}


