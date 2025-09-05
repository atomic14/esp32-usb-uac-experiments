export function hann(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  return w;
}

export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be power of 2');
  // bit reversal
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) { const tr = re[i]; const ti = im[i]; re[i] = re[j]; im[i] = im[j]; re[j] = tr; im[j] = ti; }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let step = 1; step < n; step <<= 1) {
    const jump = step << 1;
    const delta = Math.PI / step;
    for (let group = 0; group < step; group++) {
      const wr = Math.cos(delta * group);
      const wi = -Math.sin(delta * group);
      for (let pair = group; pair < n; pair += jump) {
        const match = pair + step;
        const tr = wr * re[match] - wi * im[match];
        const ti = wr * im[match] + wi * re[match];
        re[match] = re[pair] - tr; im[match] = im[pair] - ti;
        re[pair] += tr; im[pair] += ti;
      }
    }
  }
}


