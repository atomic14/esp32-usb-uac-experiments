export type MicReader = {
  start: (sampleRate: number, onPcm: (pcm: Int16Array) => void, deviceId?: string) => Promise<void>;
  stop: () => Promise<void>;
  getSampleRate: () => number | null;
};

/**
 * Provides microphone capture using Web Audio API, delivering Int16 PCM chunks.
 * Uses an AudioWorklet when available, falling back to ScriptProcessor.
 */
export function createMicReader(): MicReader {
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let onChunk: ((pcm: Int16Array) => void) | null = null;
  const TARGET_CHUNK = 2048;
  let pending: Int16Array[] = [];
  let pendingLen = 0;

  function feed(p: Int16Array) {
    pending.push(p);
    pendingLen += p.length;
    while (pendingLen >= TARGET_CHUNK) {
      const out = new Int16Array(TARGET_CHUNK);
      let o = 0;
      while (o < TARGET_CHUNK && pending.length) {
        const head = pending[0];
        const need = TARGET_CHUNK - o;
        if (head.length <= need) {
          out.set(head, o);
          o += head.length;
          pending.shift();
        } else {
          out.set(head.subarray(0, need), o);
          pending[0] = head.subarray(need);
          o += need;
        }
      }
      pendingLen -= TARGET_CHUNK;
      if (onChunk) onChunk(out);
    }
  }

  async function start(sampleRate: number, onPcm: (pcm: Int16Array) => void, deviceId?: string): Promise<void> {
    await stop();
    onChunk = onPcm;

    // On some platforms, exact sampleRate may not be honored; we still try.
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate,
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: false,
        deviceId: deviceId ? { exact: deviceId } : undefined
      },
      video: false
    });

    // Prefer explicit sampleRate; fallback to default if unsupported
    audioContext = new AudioContext({ sampleRate });
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    try {
      // Try AudioWorklet path first for low-latency
      const workletCode = `
        class MicCaptureProcessor extends AudioWorkletProcessor {
          constructor(){ super(); this._buf = []; this._bufLen = 0; this._targetLen = 2048; }
          process(inputs){
            const input = inputs[0];
            if (!input || input.length === 0) return true;
            const ch0 = input[0];
            // Convert to Int16 and batch into ~2048-sample chunks
            const pcm = new Int16Array(ch0.length);
            for (let i=0;i<ch0.length;i++){ let v = Math.max(-1, Math.min(1, ch0[i])); pcm[i] = (v * 32767)|0; }
            this.port.postMessage(pcm, [pcm.buffer]);
            return true;
          }
        }
        registerProcessor('mic-capture', MicCaptureProcessor);
      `;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletNode = new AudioWorkletNode(audioContext, 'mic-capture');
      workletNode.port.onmessage = (ev) => {
        const pcm = new Int16Array(ev.data);
        feed(pcm);
      };
      sourceNode.connect(workletNode);
      // Connect to destination to keep context running; output remains silence
      workletNode.connect(audioContext.destination);
    } catch {
      // AudioWorklet not available; fall back
      // Fallback to ScriptProcessor if AudioWorklet is unavailable
      const bufSize = 2048;
      processorNode = audioContext.createScriptProcessor(bufSize, 1, 1);
      processorNode.onaudioprocess = (e) => {
        const ch0 = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(ch0.length);
        for (let i=0;i<ch0.length;i++){ const v = Math.max(-1, Math.min(1, ch0[i])); pcm[i] = (v * 32767)|0; }
        feed(pcm);
      };
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
    }
  }

  async function stop(): Promise<void> {
    try {
      workletNode?.disconnect(); workletNode = null;
    } catch {}
    try {
      processorNode?.disconnect(); processorNode = null;
    } catch {}
    try {
      sourceNode?.disconnect(); sourceNode = null;
    } catch {}
    if (audioContext) { try { await audioContext.close(); } catch {}; audioContext = null; }
    if (mediaStream) {
      for (const t of mediaStream.getTracks()) { try { t.stop(); } catch {} }
      mediaStream = null;
    }
    pending = []; pendingLen = 0;
    onChunk = null;
  }

  function getSampleRate(): number | null { return audioContext?.sampleRate ?? null; }

  return { start, stop, getSampleRate };
}


