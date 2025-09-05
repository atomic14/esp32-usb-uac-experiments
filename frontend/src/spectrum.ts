import { hann, fftRadix2 } from './fft';

export type BarSpectrumOptions = {
  bands?: number;
  fftSize?: number; // power of two
  minDb?: number;
  maxDb?: number;
  peakHoldDecayDbPerSec?: number; // peak marker decay speed
  levelDecayDbPerSec?: number;    // bar fall speed when signal drops
  segments?: number;               // vertical LED segments per bar
  segmentGapPx?: number;           // gap between LED segments (CSS px)
  glow?: boolean;                  // draw glow around lit LEDs
};

export class BarSpectrum {
  private ctx: CanvasRenderingContext2D;
  private bands: number;
  private fftSize: number;
  private minDb: number;
  private maxDb: number;
  private peakHoldDecay: number;
  private levelDecay: number;
  private win: Float32Array;
  private re: Float32Array;
  private im: Float32Array;
  private levels: Float32Array;  // 0..1
  private peaks: Float32Array;   // 0..1
  private lastDraw = 0;

  constructor(private canvas: HTMLCanvasElement, opts: BarSpectrumOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
    this.bands = opts.bands ?? 32;
    this.fftSize = opts.fftSize ?? 1024;
    this.minDb = opts.minDb ?? -90;
    this.maxDb = opts.maxDb ?? 0;
    this.peakHoldDecay = opts.peakHoldDecayDbPerSec ?? 15;
    this.levelDecay = opts.levelDecayDbPerSec ?? 40;
    this.win = hann(this.fftSize);
    this.re = new Float32Array(this.fftSize);
    this.im = new Float32Array(this.fftSize);
    this.levels = new Float32Array(this.bands);
    this.peaks = new Float32Array(this.bands);
    this.segments = opts.segments ?? 24;
    this.segmentGapPx = opts.segmentGapPx ?? 2;
    this.glow = opts.glow ?? true;
  }

  private dbToNorm(db: number): number {
    const t = (db - this.minDb) / (this.maxDb - this.minDb);
    return Math.max(0, Math.min(1, t));
  }

  update(pcm: Int16Array, sampleRate: number, dtSec: number): void {
    // Prepare FFT frame from latest samples
    const N = this.fftSize;
    const step = Math.max(1, Math.floor(pcm.length / N));
    for (let i = 0; i < N; i++) this.re[i] = (pcm[i * step] / 32768) * this.win[i];
    this.im.fill(0);
    fftRadix2(this.re, this.im);

    // Magnitudes for first half
    const bins = N >> 1;
    const mag = new Float32Array(bins);
    for (let k = 0; k < bins; k++) mag[k] = Math.hypot(this.re[k], this.im[k]);

    // Convert to dBFS: normalize by FFT size and Hann coherent gain, one-sided amplitude
    let sumWin = 0; for (let i = 0; i < N; i++) sumWin += this.win[i];
    const coherentGain = sumWin / N; // ~0.5 for Hann
    const scale = 2 / (N * coherentGain + 1e-12);

    // Map to log-spaced bands
    const sr2 = sampleRate / 2;
    const bandLevels = new Float32Array(this.bands);
    for (let b = 0; b < this.bands; b++) {
      const t0 = b / this.bands; const t1 = (b + 1) / this.bands;
      // Quadratic mapping for pseudo-log scale
      const f0 = Math.pow(t0, 2.0) * sr2 * 0.95 + 20; // avoid DC
      const f1 = Math.pow(t1, 2.0) * sr2 * 0.98 + 20;
      const k0 = Math.max(1, Math.floor((f0 / sr2) * bins));
      const k1 = Math.min(bins - 1, Math.ceil((f1 / sr2) * bins));
      let peak = 0;
      for (let k = k0; k <= k1; k++) { const a = mag[k] * scale; if (a > peak) peak = a; }
      const db = 20 * Math.log10(peak + 1e-12); // 0 dBFS for full-scale tone
      bandLevels[b] = this.dbToNorm(db);
    }

    // Smooth and peak hold with decay
    const levelFall = (this.levelDecay * dtSec) / (this.maxDb - this.minDb); // normalized per second
    const peakFall = (this.peakHoldDecay * dtSec) / (this.maxDb - this.minDb);
    for (let b = 0; b < this.bands; b++) {
      const target = bandLevels[b];
      if (target >= this.levels[b]) {
        // rise fast
        this.levels[b] = this.levels[b] * 0.6 + target * 0.4;
      } else {
        // fall at fixed rate
        this.levels[b] = Math.max(0, this.levels[b] - levelFall);
      }
      // peak hold
      if (this.levels[b] > this.peaks[b]) this.peaks[b] = this.levels[b];
      else this.peaks[b] = Math.max(0, this.peaks[b] - peakFall);
    }
  }

  draw(): void {
    const w = this.canvas.width, h = this.canvas.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    // background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y <= 4; y++) { const yy = Math.round((y * h) / 4) + 0.5; ctx.moveTo(0, yy); ctx.lineTo(w, yy); }
    ctx.stroke();

    const dpr = window.devicePixelRatio || 1;
    const gapX = 2 * dpr; // space between bars
    const barCount = this.bands;
    const barW = Math.max(3 * dpr, Math.floor((w - (barCount + 1) * gapX) / barCount));
    const baseX = gapX;

    const segGap = Math.max(1 * dpr, Math.floor(this.segmentGapPx * dpr));
    const segN = this.segments;
    const segH = Math.max(2 * dpr, Math.floor((h - (segN + 1) * segGap) / segN));

    // Helper to draw rounded LED segment
    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, h * 0.5, w * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
      ctx.fill();
    }

    for (let b = 0; b < barCount; b++) {
      const x = baseX + b * (barW + gapX);
      const v = this.levels[b];
      const onCount = Math.max(0, Math.min(segN, Math.floor(v * segN)));

      // draw unlit stack
      for (let s = 0; s < segN; s++) {
        const y = h - segGap - (s + 1) * segH - s * segGap;
        const lit = s < onCount;
        // segment color: green -> yellow -> red by position
        const pos = s / (segN - 1);
        const col = pos < 0.6 ? '#22c55e' : (pos < 0.85 ? '#f59e0b' : '#ef4444');
        if (lit) {
          ctx.fillStyle = col;
          if (this.glow) { ctx.shadowColor = col; ctx.shadowBlur = 6 * dpr; }
          roundRect(x, y, barW, segH, 2 * dpr);
          if (this.glow) { ctx.shadowBlur = 0; }
        } else {
          // unlit LED with subtle bevel
          const g = ctx.createLinearGradient(0, y, 0, y + segH);
          g.addColorStop(0, 'rgba(255,255,255,0.05)');
          g.addColorStop(1, 'rgba(255,255,255,0.02)');
          ctx.fillStyle = g;
          roundRect(x, y, barW, segH, 2 * dpr);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          roundRect(x + 1 * dpr, y + 1 * dpr, barW - 2 * dpr, segH - 2 * dpr, 2 * dpr);
        }
      }

      // peak marker (thin white segment line)
      const peakS = Math.max(0, Math.min(segN - 1, Math.round(this.peaks[b] * segN)));
      const py = h - segGap - (peakS + 1) * segH - peakS * segGap;
      ctx.fillStyle = '#e5e7eb';
      ctx.globalAlpha = 0.9;
      roundRect(x, py - 1 * dpr, barW, Math.max(2 * dpr, Math.floor(segH * 0.12)), 2 * dpr);
      ctx.globalAlpha = 1.0;
    }
  }
}


