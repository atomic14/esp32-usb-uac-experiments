// Minimal type shim for prefixed Web Audio
interface Window {
  webkitAudioContext?: typeof AudioContext;
}


