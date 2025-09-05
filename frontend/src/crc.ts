export function crc16ccitt(buf: Uint8Array, offset = 0, length = buf.length - offset): number {
  let crc = 0xffff;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    crc ^= (buf[i] & 0xff) << 8;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}


