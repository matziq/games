(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AztecAudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DURATIONS = {
    shot: 0.72, blast: 2.8, fuse: 1.2, ignite: 0.2, serpent: 1.15, bat: 0.34,
    swing: 0.25, hit: 0.24, hurt: 0.4, jump: 0.16, search: 0.48,
    loot: 0.38, idol: 1, win: 1.5, dead: 0.8, warning: 0.35,
    rock: 0.48, "rock-impact": 0.55, water: 2.4, ceiling: 0.7
  };
  const LEVELS = {
    shot: 0.62, blast: 0.8, ignite: 0.24, swing: 0.25, hit: 0.3,
    hurt: 0.3, jump: 0.12, search: 0.25, loot: 0.2, idol: 0.3,
    win: 0.3, dead: 0.25, warning: 0.2, rock: 0.22, "rock-impact": 0.4
  };
  const MAX_VOICES = 10;

  function noiseGenerator(seed) {
    let value = seed >>> 0 || 1;
    return () => {
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      return (value >>> 0) / 2147483648 - 1;
    };
  }

  // Original Foley synthesis: filtered turbulent noise, physical transients,
  // inharmonic resonances and short reflections, rather than a pitched UI beep.
  function synthesize(type, sampleRate = 44100, seed = 41) {
    if (!Object.hasOwn(DURATIONS, type)) throw new Error(`Unknown audio effect: ${type}`);
    const duration = DURATIONS[type], count = Math.ceil(duration * sampleRate);
    const data = new Float32Array(count), noise = noiseGenerator(seed);
    let low = 0, mid = 0, bass = 0, phase = 0;
    const aLow = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
    const aMid = 1 - Math.exp(-2 * Math.PI * 2200 / sampleRate);
    const aBass = 1 - Math.exp(-2 * Math.PI * 65 / sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate, n = noise();
      low += aLow * (n - low);
      mid += aMid * (n - mid);
      bass += aBass * (n - bass);
      const high = n - mid, band = mid - low;
      let value = 0;
      if (type === "shot") {
        value = n * 1.8 * Math.exp(-t * 210) + band * 1.4 * Math.exp(-t * 26) +
          low * 4 * Math.exp(-t * 18) + Math.sin(2 * Math.PI * 107 * t) * 0.35 * Math.exp(-t * 35);
        for (const delay of [0.038, 0.081, 0.137]) {
          if (t > delay) value += band * 0.28 * Math.exp(-(t - delay) * 16);
        }
      } else if (type === "blast") {
        value = n * 1.9 * Math.exp(-t * 90) + low * 5 * Math.exp(-t * 1.8) +
          bass * 6 * Math.exp(-t * 1.2) + band * 0.8 * Math.exp(-t * 4);
        value += Math.sin(2 * Math.PI * (47 * t - 4 * t * t)) * 0.3 * Math.exp(-t * 3);
        const grit = Math.max(0, Math.sin(t * 173) * Math.sin(t * 91 + 2));
        value += high * grit ** 8 * Math.exp(-t * 1.8) * 0.7;
      } else if (type === "fuse") {
        const sputter = Math.max(0, Math.sin(t * 117) * Math.sin(t * 67));
        value = (high * 0.16 + band * 0.12) * (0.7 + 0.3 * Math.sin(t * 31)) +
          high * sputter ** 10 * 0.5;
      } else if (type === "serpent") {
        const breath = Math.sin(Math.PI * t / duration) ** 0.7;
        value = (high * 0.5 + band * 0.32) * breath * (0.8 + 0.2 * Math.sin(t * 23));
      } else if (type === "bat") {
        for (const start of [0.012, 0.11, 0.215]) {
          const age = t - start;
          if (age >= 0 && age < 0.075) {
            const sweep = 5900 * age - 21000 * age * age;
            const envelope = Math.sin(Math.PI * age / 0.075) ** 2;
            value += Math.sin(2 * Math.PI * sweep + 0.75 * Math.sin(2 * Math.PI * 1130 * age)) * envelope * 0.28;
          }
        }
        value += band * Math.exp(-t * 14) * 0.15;
      } else if (type === "water") {
        value = (band * 0.45 + low * 1.2) * (0.7 + 0.12 * Math.sin(2 * Math.PI * t / duration));
        for (const start of [0.12, 0.55, 1.08, 1.46, 1.94]) {
          const age = t - start;
          if (age >= 0 && age < 0.12) value += Math.sin(2 * Math.PI * (480 * age + 1800 * age * age)) *
            Math.sin(Math.PI * age / 0.12) * Math.exp(-age * 30) * 0.1;
        }
      } else if (type === "swing" || type === "jump") {
        const envelope = Math.sin(Math.PI * t / duration) ** 2;
        value = (band * (1 - t / duration) + high * t / duration) * envelope * 0.8;
      } else if (type === "hit" || type === "hurt" || type === "dead") {
        value = low * 3 * Math.exp(-t * 22) + band * 0.6 * Math.exp(-t * 45);
        if (type !== "hit") {
          const breath = Math.sin(Math.PI * t / duration);
          value += band * breath * 0.35;
          phase += 2 * Math.PI * (110 - 45 * t / duration) / sampleRate;
          value += Math.sin(phase + Math.sin(phase * 2) * 0.5) * breath * 0.08;
        }
      } else if (["rock", "rock-impact", "search", "ceiling"].includes(type)) {
        const impact = type === "rock-impact";
        const rough = 0.4 + 0.6 * Math.abs(Math.sin(t * 47) * Math.sin(t * 19));
        value = (band * 0.7 + low * (impact ? 4 : 1.3)) * rough * Math.exp(-t * (impact ? 8 : 4));
        value += n * Math.max(0, Math.sin(t * 211)) ** 24 * Math.exp(-t * 9) * 0.35;
        if (impact) value += Math.sin(t * 2 * Math.PI * 76) * Math.exp(-t * 24) * 0.3;
        if (type === "search") value = band * (0.25 + Math.sin(t * 26) ** 2) *
          Math.sin(Math.PI * t / duration) + low * 1.3 * Math.exp(-t * 18);
      } else if (type === "ignite" || type === "warning") {
        value = high * Math.exp(-t * 36) * 0.7 + band * Math.sin(Math.PI * t / duration) * 0.25;
      } else {
        // Brief metal/stone inventory resonances; no sustained melody over play.
        const strikes = type === "win" ? [0, 0.25, 0.5] : type === "idol" ? [0, 0.18] : [0];
        for (const start of strikes) {
          const age = t - start;
          if (age < 0) continue;
          value += (Math.sin(age * 2 * Math.PI * 1390) + 0.35 * Math.sin(age * 2 * Math.PI * 2317) +
            0.2 * Math.sin(age * 2 * Math.PI * 3671)) * Math.exp(-age * 17) * 0.18;
          value += high * Math.exp(-age * 150) * 0.25;
        }
      }
      const fadeIn = Math.min(1, t / 0.0015);
      const fadeOut = Math.min(1, (duration - t) / 0.035);
      data[i] = value * fadeIn * fadeOut;
    }
    let peak = 0;
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    const scale = peak > 0 ? 0.85 / peak : 0;
    for (let i = 0; i < count; i++) data[i] *= scale;
    return data;
  }

  function positional(state, source, volume = 1) {
    const dx = (source.x ?? state.player.x) - state.player.x;
    const dy = (source.y ?? state.player.y) - state.player.y;
    return { volume: volume * Math.max(0.12, 1 - Math.hypot(dx, dy) / 600), pan: Math.max(-0.85, Math.min(0.85, dx / 280)) };
  }

  class Director {
    constructor() { this.reset(); }
    reset() {
      this.state = null; this.roomId = null; this.wasRunning = false;
      this.creatures = new Map(); this.nextCreature = 0; this.lastCeiling = false;
    }
    step(state, enabled, blocked = false) {
      const result = { stop: false, cues: [], loops: [] };
      if (!state) { this.reset(); result.stop = true; return result; }
      const events = state.events.splice(0);
      const changed = this.state !== state || this.roomId !== state.roomId;
      if (changed) {
        this.creatures.clear(); this.nextCreature = state.time + 0.8; this.lastCeiling = false;
        result.stop = true;
      }
      this.state = state; this.roomId = state.roomId;
      const running = enabled && !blocked && !state.paused && state.status === "playing";
      if (!running) {
        result.stop = this.wasRunning || changed || blocked || !enabled || state.paused;
        if (this.wasRunning && enabled && !blocked && !state.paused) {
          for (const event of events) {
            if (["dead", "win", "blast"].includes(event.type) && event.roomId === state.roomId) {
              result.cues.push({ type: event.type, ...positional(state, event, LEVELS[event.type]) });
            }
          }
        }
        this.wasRunning = false;
        return result;
      }
      if (!this.wasRunning) this.nextCreature = state.time + 0.8;
      this.wasRunning = true;
      const r = state.rooms[state.roomId];
      for (const event of events) {
        if (state.time - event.time > 0.5 || event.time > state.time) continue;
        if (event.roomId !== state.roomId) {
          if (event.type === "blast" && Object.values(r.exits).includes(event.roomId)) {
            result.cues.push({ type: "blast", volume: 0.16, pan: 0, muffled: true });
          }
          continue;
        }
        const type = event.type === "fuse" ? "ignite" : event.type;
        if (Object.hasOwn(LEVELS, type)) result.cues.push({ type, ...positional(state, event, LEVELS[type]) });
      }
      const bomb = state.bombs.find(b => b.roomId === state.roomId);
      if (bomb) result.loops.push({ key: "fuse", type: "fuse", offset: 2.4 - bomb.fuse, ...positional(state, bomb, 0.17) });
      const h = r.hazard;
      if (h?.type === "flood" && h.level > 0) {
        result.loops.push({ key: "water", type: "water", offset: state.time - h.startedAt,
          volume: 0.07 + h.level / 76 * 0.05, pan: 0 });
      }
      const ceiling = h?.type === "ceiling" && Math.sin(state.time * 1.6 + h.phase) > 0.3;
      if (ceiling && !this.lastCeiling) {
        result.cues.push({ type: "ceiling", ...positional(state, { x: h.x, y: 258 }, 0.15) });
      }
      this.lastCeiling = ceiling;
      if (state.time >= this.nextCreature) {
        const nearby = r.enemies.filter(e => e.hp > 0 && ["serpent", "bat"].includes(e.type) &&
          Math.abs(e.y - state.player.y) < 70 && Math.hypot(e.x - state.player.x, e.y - state.player.y) < 210 &&
          (this.creatures.get(e) ?? 0) <= state.time)
          .sort((a, b) => Math.abs(a.x - state.player.x) - Math.abs(b.x - state.player.x));
        const enemy = nearby[0];
        if (enemy) {
          const index = r.enemies.indexOf(enemy);
          result.cues.push({ type: enemy.type, ...positional(state, enemy, enemy.type === "serpent" ? 0.3 : 0.16) });
          this.creatures.set(enemy, state.time + (enemy.type === "serpent" ? 6 : 4.5) + index * 0.37);
          this.nextCreature = state.time + 1.8;
        }
      }
      return result;
    }
  }

  class Mixer {
    constructor(context, samples) {
      if (!samples?.shot?.pcm16 || !samples?.blast?.pcm16) {
        throw new Error("The offline gunshot and explosion samples are missing.");
      }
      this.context = context;
      this.samples = samples;
      this.buffers = new Map(); this.voices = new Set(); this.loops = new Map();
      this.played = {}; this.muted = false;
      this.bus = context.createGain();
      this.bus.gain.value = 0.55;
      this.compressor = context.createDynamicsCompressor();
      this.compressor.threshold.value = -15;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.18;
      this.output = context.createGain(); this.output.gain.value = 0.7;
      this.bus.connect(this.compressor); this.compressor.connect(this.output);
      this.output.connect(context.destination);
    }
    buffer(type) {
      if (!this.buffers.has(type)) {
        const recording = this.samples[type];
        const sampleRate = recording?.sampleRate || this.context.sampleRate;
        const data = synthesize(type, sampleRate);
        if (recording) {
          const bytes = atob(recording.pcm16);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const word = i * 2 + 1 < bytes.length ? bytes.charCodeAt(i * 2) | bytes.charCodeAt(i * 2 + 1) << 8 : 0;
            const sample = (word > 32767 ? word - 65536 : word) / 32768;
            data[i] = sample * 0.9 + data[i] * (type === "blast" ? 0.3 : 0.14);
            peak = Math.max(peak, Math.abs(data[i]));
          }
          if (peak > 0.85) for (let i = 0; i < data.length; i++) data[i] *= 0.85 / peak;
        }
        const buffer = this.context.createBuffer(1, data.length, sampleRate);
        buffer.copyToChannel(data, 0); this.buffers.set(type, buffer);
      }
      return this.buffers.get(type);
    }
    setMuted(value) {
      this.muted = value;
      const now = this.context.currentTime;
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setTargetAtTime(value ? 0 : 0.7, now, 0.008);
      if (value) this.stopAll();
    }
    stopVoice(voice) {
      if (voice.stopped) return;
      voice.stopped = true;
      const now = this.context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.005);
      voice.source.stop(now + 0.025);
      this.voices.delete(voice);
      if (voice.key && this.loops.get(voice.key) === voice) this.loops.delete(voice.key);
    }
    stopAll() { for (const voice of [...this.voices]) this.stopVoice(voice); }
    play(cue, loop = false) {
      if (this.muted || !Object.hasOwn(DURATIONS, cue.type)) return null;
      if (this.voices.size >= MAX_VOICES) {
        const disposable = [...this.voices].find(voice => !voice.key);
        if (!disposable) return null;
        this.stopVoice(disposable);
      }
      const context = this.context, now = context.currentTime;
      const source = context.createBufferSource(), gain = context.createGain();
      const pan = context.createStereoPanner(), filter = context.createBiquadFilter();
      source.buffer = this.buffer(cue.type); source.loop = loop;
      filter.type = "lowpass"; filter.frequency.value = cue.muffled ? 450 : 16000;
      pan.pan.value = cue.pan || 0;
      const volume = Math.max(0, Math.min(0.8, cue.volume));
      gain.gain.value = loop ? 0 : volume;
      if (loop) gain.gain.setTargetAtTime(volume, now, 0.008);
      source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(this.bus);
      const voice = { source, gain, pan, filter, key: loop ? cue.key : null, stopped: false, type: cue.type };
      this.voices.add(voice);
      if (loop) this.loops.set(cue.key, voice);
      source.onended = () => {
        this.voices.delete(voice);
        if (voice.key && this.loops.get(voice.key) === voice) this.loops.delete(voice.key);
        source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect();
      };
      source.start(now, loop ? Math.max(0, cue.offset || 0) % source.buffer.duration : 0);
      this.played[cue.type] = (this.played[cue.type] || 0) + 1;
      return voice;
    }
    update(plan) {
      if (plan.stop) this.stopAll();
      const keys = new Set(plan.loops.map(loop => loop.key));
      for (const [key, voice] of this.loops) if (!keys.has(key)) this.stopVoice(voice);
      for (const loop of plan.loops) {
        const voice = this.loops.get(loop.key);
        if (!voice) this.play(loop, true);
        else {
          voice.gain.gain.setTargetAtTime(loop.volume, this.context.currentTime, 0.05);
          voice.pan.pan.setTargetAtTime(loop.pan, this.context.currentTime, 0.05);
        }
      }
      for (const cue of plan.cues) this.play(cue);
    }
    snapshot() {
      return { context: this.context.state, muted: this.muted, voices: this.voices.size,
        loops: [...this.loops.keys()], played: { ...this.played } };
    }
  }

  return { DURATIONS, MAX_VOICES, synthesize, positional, Director, Mixer };
});
