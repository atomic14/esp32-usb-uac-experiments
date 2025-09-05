export function int16ToWavBlob(samples: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  function write32(offset: number, val: number) { view.setUint32(offset, val, true); }
  function write16(offset: number, val: number) { view.setUint16(offset, val, true); }

  writeString(0, 'RIFF');
  write32(4, 36 + dataSize);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  write32(16, 16); // PCM chunk size
  write16(20, 1);  // PCM format
  write16(22, numChannels);
  write32(24, sampleRate);
  write32(28, byteRate);
  write16(32, blockAlign);
  write16(34, 16); // bits per sample
  writeString(36, 'data');
  write32(40, dataSize);

  // PCM data
  const pcmView = new Int16Array(buffer, 44);
  pcmView.set(samples);
  return new Blob([buffer], { type: 'audio/wav' });
}


