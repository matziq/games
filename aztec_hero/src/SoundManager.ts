// Procedural sound generation for Aztec Hero using Web Audio API
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function resumeCtx() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// --- Cached buffers ---
const buffers: Record<string, AudioBuffer> = {};

function playBuffer(name: string, volume = 0.15) {
  resumeCtx();
  const ac = getCtx();
  const buf = buffers[name];
  if (!buf) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(ac.destination);
  src.start();
}

// Generate an AudioBuffer from a render function
function renderSound(
  duration: number,
  fn: (ac: OfflineAudioContext) => void
): Promise<AudioBuffer> {
  const sr = 22050;
  const offline = new OfflineAudioContext(1, Math.ceil(sr * duration), sr);
  fn(offline);
  return offline.startRendering();
}

// --- Sound generators ---

async function genFootstep(): Promise<AudioBuffer> {
  return renderSound(0.08, (ac) => {
    const buf = ac.createBuffer(1, ac.length, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ac.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.3;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    src.connect(lp).connect(ac.destination);
    src.start();
  });
}

async function genJump(): Promise<AudioBuffer> {
  return renderSound(0.15, (ac) => {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, 0);
    osc.frequency.exponentialRampToValueAtTime(600, 0.1);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.2, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.15);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(0.15);
  });
}

async function genGemPickup(): Promise<AudioBuffer> {
  return renderSound(0.25, (ac) => {
    // Two quick ascending tones
    for (let i = 0; i < 2; i++) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      const baseFreq = 800 + i * 400;
      osc.frequency.setValueAtTime(baseFreq, i * 0.08);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, i * 0.08 + 0.06);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, 0);
      gain.gain.setValueAtTime(0.15, i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, i * 0.08 + 0.1);
      osc.connect(gain).connect(ac.destination);
      osc.start(i * 0.08);
      osc.stop(i * 0.08 + 0.1);
    }
  });
}

async function genEnemyKill(): Promise<AudioBuffer> {
  return renderSound(0.2, (ac) => {
    // Crunchy pop
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.05), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ac.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.4;
    }
    const noiseSrc = ac.createBufferSource();
    noiseSrc.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 2;
    noiseSrc.connect(bp).connect(ac.destination);
    noiseSrc.start();

    // Low thud
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, 0);
    osc.frequency.exponentialRampToValueAtTime(80, 0.15);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.2, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(0.18);
  });
}

async function genLadder(): Promise<AudioBuffer> {
  return renderSound(0.1, (ac) => {
    // Wooden creak
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, 0);
    osc.frequency.exponentialRampToValueAtTime(90, 0.08);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.1, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.1);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(0.1);
  });
}

async function genDeath(): Promise<AudioBuffer> {
  return renderSound(0.6, (ac) => {
    // Descending tone
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, 0);
    osc.frequency.exponentialRampToValueAtTime(60, 0.5);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.15, 0);
    gain.gain.linearRampToValueAtTime(0.2, 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.55);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, 0);
    lp.frequency.exponentialRampToValueAtTime(200, 0.5);
    osc.connect(lp).connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(0.55);
  });
}

async function genExplosion(): Promise<AudioBuffer> {
  return renderSound(0.4, (ac) => {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.4), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ac.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8) * 0.5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500, 0);
    lp.frequency.exponentialRampToValueAtTime(100, 0.35);
    src.connect(lp).connect(ac.destination);
    src.start();
  });
}

// --- Ambient drip system ---
let ambientInterval: number | null = null;

function playDrip() {
  resumeCtx();
  const ac = getCtx();
  const osc = ac.createOscillator();
  osc.type = 'sine';
  const freq = 1800 + Math.random() * 800;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, ac.currentTime + 0.08);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.04 + Math.random() * 0.03, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;
  osc.connect(lp).connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.12);
}

function scheduleDrip() {
  const delay = 2000 + Math.random() * 5000; // 2-7 seconds between drips
  ambientInterval = window.setTimeout(() => {
    playDrip();
    scheduleDrip();
  }, delay);
}

// --- Public API ---

export async function initSounds(): Promise<void> {
  getCtx();
  const [footstep, jump, gem, kill, ladder, death, explosion] = await Promise.all([
    genFootstep(),
    genJump(),
    genGemPickup(),
    genEnemyKill(),
    genLadder(),
    genDeath(),
    genExplosion(),
  ]);
  buffers.footstep = footstep;
  buffers.jump = jump;
  buffers.gem = gem;
  buffers.kill = kill;
  buffers.ladder = ladder;
  buffers.death = death;
  buffers.explosion = explosion;
}

export function playFootstep() { playBuffer('footstep', 0.10); }
export function playJump() { playBuffer('jump', 0.12); }
export function playGem() { playBuffer('gem', 0.15); }
export function playKill() { playBuffer('kill', 0.18); }
export function playLadder() { playBuffer('ladder', 0.08); }
export function playDeath() { playBuffer('death', 0.20); }
export function playExplosion() { playBuffer('explosion', 0.22); }

export function startAmbient() {
  stopAmbient();
  scheduleDrip();
}

export function stopAmbient() {
  if (ambientInterval !== null) {
    clearTimeout(ambientInterval);
    ambientInterval = null;
  }
}
