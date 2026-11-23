export function createMusic(onError) {
  let context, master, nextBeat = 0, beat = 0, volume = 0.35, muted = false, failed = false, generation = 0;
  const melody = [0,7,3,10,7,3,12,10,5,12,8,7,3,5,7,2];
  const bass = [0,0,8,8,5,5,10,7];
  function tone(frequency, start, duration, level, type) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(0.0001,start);
    gain.gain.exponentialRampToValueAtTime(level,start+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    oscillator.connect(gain); gain.connect(master);
    oscillator.start(start); oscillator.stop(start+duration+0.01);
  }
  function fail() {
    if (!failed) onError();
    failed = true;
  }
  function configure(options, playing) {
    volume = options.volume; muted = options.muted;
    if (muted) generation++;
    if (context && master) master.gain.setTargetAtTime(playing && !muted ? volume : 0,context.currentTime,0.015);
  }
  async function activate(options) {
    configure(options,true);
    if (muted || failed) return;
    const request = ++generation;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) { fail(); return; }
        context = new Audio(); master = context.createGain(); master.connect(context.destination);
      }
      if (context.state !== "running") await context.resume();
      if (request !== generation) return;
      if (context.state !== "running") { fail(); return; }
      configure(options,true); nextBeat = context.currentTime;
    } catch { fail(); }
  }
  function update(playing) {
    if (!playing || muted || failed || !context || context.state !== "running") return;
    if (nextBeat < context.currentTime - 0.3) nextBeat = context.currentTime;
    while (nextBeat < context.currentTime + 0.1) {
      const pitch = melody[beat % melody.length];
      tone(261.6256 * 2 ** (pitch / 12),nextBeat,0.14,0.12,"triangle");
      if (beat % 2 === 0) tone(130.8128 * 2 ** (bass[Math.floor(beat/2)%bass.length] / 12),nextBeat,0.17,0.15,"sine");
      if (beat % 4 === 0) tone(72,nextBeat,0.07,0.18,"sine");
      beat++; nextBeat += 0.2;
    }
  }
  function silence() {
    generation++;
    if (context && master) master.gain.setTargetAtTime(0,context.currentTime,0.015);
  }
  return {activate,configure,update,silence};
}
