import { HEADER_LEN, TRAILER_LEN, SYNC } from './constants';
import { crc16ccitt } from './crc';

const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const crcCheckEl = document.getElementById('crcCheck') as HTMLInputElement;
const statsEl = document.getElementById('stats') as HTMLDivElement;
const logEl = document.getElementById('log') as HTMLPreElement;
const clearLogBtn = document.getElementById('clearLogBtn') as HTMLButtonElement;

let port: SerialPort | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let rx = new Uint8Array(0);
let pkt = 0, drops = 0, crcErr = 0;
let expectedSeq: number | null = null;
let bpsWindow = 0; let lastBps = 0; let lastTs = performance.now();

function log(msg: string){
  const ts = new Date().toISOString().split('T')[1].replace('Z','');
  logEl.textContent += `[${ts}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStats(){
  statsEl.textContent = `packets=${pkt} drops=${drops} crcErr=${crcErr} bps=${(lastBps/1024).toFixed(1)}k`; 
}

async function onConnect(){
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', bufferSize: 16384 });
    try {
      // Assert DTR; some CDC stacks send BREAK when DTR is deasserted
      // @ts-ignore
      await port.setSignals({ dataTerminalReady: true, requestToSend: false, break: false });
    } catch {}
    reader = port.readable!.getReader();
    connectBtn.disabled = true; disconnectBtn.disabled = false;
    pkt = 0; drops = 0; crcErr = 0; expectedSeq = null; rx = new Uint8Array(0);
    log('Opened port at 115200 baud');
    readLoop();
  } catch (e) {
    log('Open error: ' + (e instanceof Error ? e.message : String(e)));
  }
}

async function onDisconnect(){
  try { await reader?.cancel(); reader?.releaseLock(); } catch{}
  try { await port?.close(); } catch{}
  reader = null; port = null;
  connectBtn.disabled = false; disconnectBtn.disabled = true;
  log('Closed port');
}

connectBtn.addEventListener('click', onConnect);
disconnectBtn.addEventListener('click', onDisconnect);
clearLogBtn.addEventListener('click', ()=>{ logEl.textContent=''; });

function appendRx(chunk: Uint8Array){
  const a = new Uint8Array(rx.length + chunk.length);
  a.set(rx, 0); a.set(chunk, rx.length); rx = a;
  bpsWindow += chunk.length;
  const now = performance.now();
  if (now - lastTs >= 1000) { lastBps = bpsWindow; bpsWindow = 0; lastTs = now; updateStats(); }
}

function processRx(){
  let i = 0;
  while (i + HEADER_LEN + TRAILER_LEN <= rx.length) {
    if (rx[i] !== SYNC) { i++; continue; }
    if (i + HEADER_LEN + TRAILER_LEN > rx.length) break;
    const len = rx[i+1] | (rx[i+2] << 8);
    const total = HEADER_LEN + len + TRAILER_LEN;
    if (i + total > rx.length) break;

    const seq = (rx[i+3] | (rx[i+4]<<8) | (rx[i+5]<<16) | (rx[i+6]<<24)) >>> 0;
    const crcRecv = rx[i + HEADER_LEN + len] | (rx[i + HEADER_LEN + len + 1] << 8);
    if (crcCheckEl.checked) {
      const crcCalc = crc16ccitt(rx, i, HEADER_LEN + len);
      if (crcCalc !== crcRecv) { crcErr++; log(`CRC mismatch at i=${i} (calc=${crcCalc} recv=${crcRecv})`); i++; continue; }
    }

    if (expectedSeq !== null && seq !== expectedSeq) {
      const diff = (seq - expectedSeq) >>> 0; if (diff !== 0) { drops += diff; log(`SEQ jump: expected ${expectedSeq}, got ${seq} (+${diff})`); }
    }
    expectedSeq = (seq + 1) >>> 0;

    pkt++;
    if ((pkt & 0x3F) === 0) updateStats();
    i += total;
  }
  if (i > 0) rx = rx.slice(i);
}

async function readLoop(){
  while (reader) {
    try {
      const { value, done } = await reader.read();
      if (done) { log('Reader done'); break; }
      if (!value) continue;
      appendRx(value);
      processRx();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('Read error: ' + msg);
      // Continue on Break errors
      if (/break/i.test(msg)) { await new Promise(r=>setTimeout(r,50)); continue; }
      break;
    }
  }
  await onDisconnect();
}


