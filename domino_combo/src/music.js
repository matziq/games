// Original short loops; no external audio assets or network requests.
const tracks = [
  { name: 'Funky', bpm: 112, wave: 'triangle', notes: [40, null, 47, 50, null, 47, 52, 50, 40, null, 45, 47, 50, 47, 45, null] },
  { name: 'Pop', bpm: 120, wave: 'sine', notes: [60, 64, 67, 64, 62, 65, 69, 65, 57, 60, 64, 60, 59, 62, 67, 62] },
  { name: 'Dance', bpm: 128, wave: 'sawtooth', notes: [45, 57, 52, 57, 48, 60, 55, 60, 43, 55, 50, 55, 40, 52, 47, 52] },
  { name: '8-bit Arcade', bpm: 144, wave: 'square', notes: [72, 76, 79, 76, 74, 77, 81, 77, 69, 72, 76, 72, 71, 74, 79, 74] },
];

export const musicNames = ['Off', ...tracks.map((track) => track.name)];

export function createMusic() {
  let context;
  let timer;
  let nextTime = 0;
  let step = 0;
  let active = 0;
  let generation = 0;
  const voices = new Set();

  function stop() {
    generation++;
    clearInterval(timer);
    timer = null;
    for (const voice of voices) {
      try { voice.stop(); } catch (error) { console.warn('Music voice already stopped.', error); }
    }
    voices.clear();
    active = 0;
  }

  function schedule() {
    const track = tracks[active - 1];
    if (!track || !context || context.state !== 'running') return;
    while (nextTime < context.currentTime + 0.18) {
      const note = track.notes[step % track.notes.length];
      if (note !== null) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = track.wave;
        oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
        gain.gain.setValueAtTime(0.0001, nextTime);
        gain.gain.exponentialRampToValueAtTime(track.wave === 'square' || track.wave === 'sawtooth' ? 0.018 : 0.035, nextTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, nextTime + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(nextTime);
        oscillator.stop(nextTime + 0.19);
      }
      nextTime += 60 / track.bpm / 2;
      step++;
    }
  }

  async function start(index) {
    stop();
    if (!index || document.hidden) return;
    const request = generation;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('This device does not support music playback.');
    context ||= new Audio();
    await context.resume();
    if (document.hidden || request !== generation) return;
    if (context.state !== 'running') throw new Error('Audio playback was blocked.');
    active = index;
    step = 0;
    nextTime = context.currentTime + 0.03;
    schedule();
    timer = setInterval(schedule, 100);
  }

  return { start, stop };
}
