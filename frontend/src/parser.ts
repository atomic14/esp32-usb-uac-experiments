import { HEADER_LEN, TRAILER_LEN, SYNC } from './constants';
import { crc16ccitt } from './crc';

export type PcmHandler = (pcm: Int16Array) => void;

export class PacketParser {
  private rx: Uint8Array = new Uint8Array(0);
  constructor(private verifyCrc: () => boolean, private onPcm: PcmHandler, private onDebug?: (m: string)=>void) {}

  append(chunk: Uint8Array) {
    const a = new Uint8Array(this.rx.length + chunk.length);
    a.set(this.rx, 0); a.set(chunk, this.rx.length);
    this.rx = a;
    this.process();
  }

  private process() {
    let i = 0;
    const rxLen = this.rx.length;
    while (i + HEADER_LEN + TRAILER_LEN <= rxLen) {
      if (this.rx[i] !== SYNC) { i++; continue; }
      if (i + HEADER_LEN + TRAILER_LEN > rxLen) break;
      const payloadLen = this.rx[i+1] | (this.rx[i+2] << 8);
      const total = HEADER_LEN + payloadLen + TRAILER_LEN;
      if (i + total > rxLen) break;

      const crcRecv = this.rx[i + HEADER_LEN + payloadLen] | (this.rx[i + HEADER_LEN + payloadLen + 1] << 8);
      if (this.verifyCrc()) {
        const crcCalc = crc16ccitt(this.rx, i, HEADER_LEN + payloadLen);
        if (crcCalc !== crcRecv) { this.onDebug?.(`CRC mismatch (calc=${crcCalc} recv=${crcRecv})`); i++; continue; }
      }

      const payloadStart = i + HEADER_LEN;
      const payloadEnd = payloadStart + payloadLen;
      const pcmBytes = this.rx.subarray(payloadStart, payloadEnd);
      // Ensure 2-byte alignment for Int16Array view; copy if needed
      let pcm: Int16Array;
      if ((pcmBytes.byteOffset & 1) === 0) {
        pcm = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
      } else {
        const copy = new Uint8Array(pcmBytes); // new buffer with offset 0
        pcm = new Int16Array(copy.buffer, 0, copy.byteLength / 2);
      }
      this.onPcm(new Int16Array(pcm)); // copy for safety

      i += total;
    }
    if (i > 0) this.rx = this.rx.slice(i);
  }
}


