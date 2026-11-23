export function createSounds(onUnavailable, onAvailable = () => {}, Audio = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context, notified = false;
  function unavailable() {
    if (!notified) { notified = true; onUnavailable(); }
  }
  function ready() { notified = false; onAvailable(); }
  function activate() {
    try {
      if (!Audio) { unavailable(); return; }
      context ||= new Audio();
      if (context.state === "suspended") context.resume().then(ready, unavailable);
      else if (context.state === "running") ready();
    } catch { context = null; unavailable(); }
  }
  function tone(start, frequency, endFrequency, duration, type, volume) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.01);
  }
  return {
    activate,
    sad() {
      activate();
      if (!context) return;
      try {
        const start = context.currentTime + 0.02;
        [330, 294, 262, 196].forEach((frequency, i) => tone(start + i * 0.16, frequency, frequency * 0.92, 0.2, "sawtooth", 0.045));
      } catch { unavailable(); }
    },
    impact() {
      if (!context || context.state !== "running") { unavailable(); return; }
      try { tone(context.currentTime, 620, 250, 0.07, "triangle", 0.055); }
      catch { unavailable(); }
    }
  };
}
