let currentPort: SerialPort | null = null;

export async function requestAndOpen(baudRate = 115200): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  if (!('serial' in navigator)) {
    alert('Web Serial not supported in this browser. Use Chrome/Edge.');
    return null;
  }
  const port = await navigator.serial.requestPort({});
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', bufferSize: 16384, flowControl: 'none' });
  currentPort = port;
  const reader = port.readable?.getReader();
  return reader ?? null;
}

export async function closeCurrentPort(): Promise<void> {
  try {
    if (currentPort) {
      await currentPort.close();
    }
  } catch {}
  currentPort = null;
}


