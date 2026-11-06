const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const E = require("./engine.js");
const A = require("./audio.js");
const samples = require("./audio-samples.js");

function advance(s, seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) E.tick(s); }
function setup() {
  const s = E.createGame({ seed: "AUDIO", difficulty: 1 });
  const d = new A.Director();
  d.step(s, true);
  return { s, d };
}
function event(s, type, roomId = s.roomId, x = s.player.x, y = s.player.y) {
  s.events.push({ type, roomId, x, y, time: s.time });
}
function energy(data, start = 0, end = data.length) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (end - start));
}

test("original sound families are finite, bounded, non-silent, distinct and properly faded", () => {
  const fingerprints = new Set();
  for (const [type, duration] of Object.entries(A.DURATIONS)) {
    const data = A.synthesize(type, 22050);
    assert.equal(data.length, Math.ceil(duration * 22050));
    let peak = 0;
    for (const sample of data) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); }
    assert.ok(peak >= 0.8 && peak <= 0.851, `${type}: peak ${peak}`);
    assert.ok(energy(data) > 0.01, type);
    assert.equal(Math.abs(data[0]), 0);
    assert.ok(Math.abs(data[data.length - 1]) < 0.002, `${type}: audible end discontinuity`);
    const fingerprint = createHash("sha256").update(Buffer.from(data.buffer)).digest("hex");
    assert.equal(fingerprints.has(fingerprint), false, `${type}: duplicated sound`);
    fingerprints.add(fingerprint);
  }
  assert.throws(() => A.synthesize("unknown"), /Unknown audio/);
  const shot = A.synthesize("shot", 22050), blast = A.synthesize("blast", 22050);
  assert.ok(energy(shot, 0, 2205) > energy(shot, 8820, 13230) * 2);
  assert.ok(energy(blast, 22050, 44100) > 0.005, "explosion has a real rumbling tail");
  assert.ok(blast.length > shot.length * 3);
});

test("licensed embedded samples match safe PCM format and contain no full-scale clipping", () => {
  for (const [name, sample] of Object.entries(samples)) {
    assert.equal(sample.sampleRate, 22050);
    const data = Buffer.from(sample.pcm16, "base64");
    assert.ok(data.length > 20000, name);
    let peak = 0, sum = 0;
    for (let i = 0; i < data.length; i += 2) {
      const value = data.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(value)); sum += value * value;
    }
    assert.ok(peak > 0.79 && peak < 0.81);
    assert.ok(Math.sqrt(sum / (data.length / 2)) > 0.03, name);
  }
});

test("gunshot is emitted only by a real shot, with its room, position and simulation time", () => {
  const { s, d } = setup();
  E.command(s, "fire"); assert.equal(d.step(s, true).cues.length, 0);
  s.inventory.pistol = true; s.inventory.ammo = 2;
  E.command(s, "fire");
  assert.deepEqual(s.events[0], { type: "shot", roomId: 0, x: 40, y: 166, time: 0 });
  assert.equal(d.step(s, true).cues[0].type, "shot");
  E.command(s, "fire"); assert.equal(d.step(s, true).cues.length, 0, "cooldown has no sound");
  advance(s, 0.4); E.command(s, "fire");
  assert.equal(d.step(s, true).cues[0].type, "shot");
  advance(s, 0.4); E.command(s, "fire"); assert.equal(d.step(s, true).cues.length, 0, "empty pistol has no shot");
});

test("fuse follows remaining time, ends exactly on detonation, and resumes at its correct phase", () => {
  const { s, d } = setup();
  E.command(s, "bomb");
  let plan = d.step(s, true);
  assert.equal(plan.cues[0].type, "ignite");
  assert.equal(plan.loops[0].key, "fuse");
  advance(s, 0.8); plan = d.step(s, true);
  assert.ok(Math.abs(plan.loops[0].offset - 0.8) < 0.01);
  E.setPaused(s, true);
  plan = d.step(s, true); assert.equal(plan.stop, true); assert.equal(plan.loops.length, 0);
  const fuse = s.bombs[0].fuse;
  advance(s, 5); assert.equal(s.bombs[0].fuse, fuse);
  E.setPaused(s, false); plan = d.step(s, true);
  assert.ok(Math.abs(plan.loops[0].offset - 0.8) < 0.01);
  advance(s, 1.7); plan = d.step(s, true);
  assert.equal(plan.loops.length, 0);
  assert.equal(plan.cues.filter(c => c.type === "blast").length, 1);
  assert.equal(d.step(s, true).cues.length, 0);
});

test("leaving a lit bomb stops the fuse, permits only a muffled adjacent-room explosion", () => {
  const { s, d } = setup();
  const neighbor = Object.values(s.rooms[0].exits)[0];
  E.command(s, "bomb"); d.step(s, true);
  s.roomId = neighbor;
  let plan = d.step(s, true);
  assert.equal(plan.stop, true); assert.equal(plan.loops.length, 0);
  advance(s, 2.5);
  plan = d.step(s, true);
  const blast = plan.cues.find(c => c.type === "blast");
  assert.ok(blast?.muffled); assert.equal(blast.volume, 0.16);
  event(s, "blast", 0);
  s.roomId = s.rooms.find(r => r.id !== 0 && !Object.values(r.exits).includes(0)).id;
  assert.equal(d.step(s, true).cues.some(c => c.type === "blast"), false);
});

test("mute, blocked UI, stale events, death and reset cannot replay old sounds", () => {
  const { s, d } = setup();
  event(s, "shot");
  assert.equal(d.step(s, false).cues.length, 0); assert.equal(s.events.length, 0);
  assert.equal(d.step(s, true).cues.length, 0);
  event(s, "shot"); assert.equal(d.step(s, true, true).cues.length, 0);
  assert.equal(d.step(s, true).cues.length, 0);
  event(s, "shot"); s.time += 2;
  assert.equal(d.step(s, true).cues.length, 0);
  s.status = "dead"; event(s, "dead");
  let plan = d.step(s, true);
  assert.equal(plan.stop, true); assert.equal(plan.cues[0].type, "dead"); assert.equal(plan.loops.length, 0);
  plan = d.step(s, true);
  assert.equal(plan.stop, false, "let the short end-state tail finish");
  assert.equal(plan.cues.length, 0);
  const next = E.createGame({ seed: s.seed });
  plan = d.step(next, true); assert.equal(plan.stop, true); assert.equal(plan.cues.length, 0);
});

test("animal calls require live nearby creatures on a visible tier and respect shared cooldowns", () => {
  const { s, d } = setup();
  const snake = { type: "serpent", hp: 2, x: 95, y: 166 };
  const bat = { type: "bat", hp: 2, x: 120, y: 153 };
  s.rooms[0].enemies = [snake, bat];
  s.time = 0.7; assert.equal(d.step(s, true).cues.length, 0);
  s.time = 0.9;
  let plan = d.step(s, true);
  assert.equal(plan.cues.length, 1); assert.equal(plan.cues[0].type, "serpent");
  assert.ok(plan.cues[0].pan > 0); assert.ok(plan.cues[0].volume < 0.3);
  for (let i = 0; i < 100; i++) assert.equal(d.step(s, true).cues.length, 0, "not per animation frame");
  s.time = 2.8; plan = d.step(s, true); assert.equal(plan.cues[0].type, "bat");
  snake.hp = 0; bat.x = 500; s.time = 20;
  assert.equal(d.step(s, true).cues.length, 0);
  bat.x = 45; bat.y = 74;
  assert.equal(d.step(s, true).cues.length, 0, "out-of-tier creature is silent");
  bat.y = 153; plan = d.step(s, true); assert.equal(plan.cues[0].type, "bat");
  bat.hp = 0; s.time = 40; assert.equal(d.step(s, true).cues.length, 0);
});

test("water and ceiling ambience track room state; rock release and impact are separate events", () => {
  const { s, d } = setup();
  s.rooms[0].hazard = { type: "flood", level: 20, startedAt: 0 };
  assert.equal(d.step(s, true).loops[0].key, "water");
  s.rooms[0].hazard.level = 0; assert.equal(d.step(s, true).loops.length, 0);
  s.rooms[0].hazard = { type: "ceiling", x: 470, phase: 1 };
  assert.equal(d.step(s, true).cues[0].type, "ceiling");
  assert.equal(d.step(s, true).cues.length, 0);
  const actual = E.createGame({ seed: "TRAP-DEMO-2680" });
  actual.roomId = 8; actual.player.y = 74; actual.player.x = 280;
  advance(actual, 3.2);
  assert.ok(actual.events.some(e => e.type === "rock"));
  assert.ok(!actual.events.some(e => e.type === "rock-impact"));
  advance(actual, 0.7);
  assert.ok(actual.events.some(e => e.type === "rock-impact"));
});

class Parameter {
  constructor(value = 0) { this.value = value; }
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; }
}
function mockContext() {
  const sources = [];
  function node() { return { connect() {}, disconnect() {} }; }
  const context = {
    state: "running", currentTime: 0, sampleRate: 22050, destination: node(),
    createGain: () => ({ ...node(), gain: new Parameter(1) }),
    createDynamicsCompressor: () => ({ ...node(), threshold: new Parameter(), knee: new Parameter(),
      ratio: new Parameter(), attack: new Parameter(), release: new Parameter() }),
    createStereoPanner: () => ({ ...node(), pan: new Parameter() }),
    createBiquadFilter: () => ({ ...node(), frequency: new Parameter() }),
    createBuffer: (_, length, rate) => ({ duration: length / rate, copyToChannel(data) { this.data = data; } }),
    createBufferSource: () => {
      const source = { ...node(), starts: [], stops: [], start(...args) { this.starts.push(args); },
        stop(...args) { this.stops.push(args); } };
      sources.push(source); return source;
    }
  };
  return { context, sources };
}

test("mixer caps voices, reuses loops, cleans sources and fades mute", () => {
  const { context, sources } = mockContext();
  const m = new A.Mixer(context, samples);
  const plan = { stop: false, cues: [], loops: [{ key: "fuse", type: "fuse", volume: 0.1, pan: 0, offset: 0.7 }] };
  m.update(plan); m.update(plan);
  assert.equal(sources.length, 1); assert.equal(sources[0].starts[0][1], 0.7);
  for (let i = 0; i < 40; i++) m.play({ type: "shot", volume: 0.6, pan: 0 });
  assert.equal(m.snapshot().voices, A.MAX_VOICES);
  assert.deepEqual(m.snapshot().loops, ["fuse"]);
  m.update({ stop: false, cues: [], loops: [] });
  assert.equal(m.snapshot().loops.length, 0);
  assert.equal(sources[0].stops.length, 1);
  m.setMuted(true); assert.equal(m.snapshot().voices, 0); assert.equal(m.output.gain.value, 0);
  const count = sources.length;
  m.play({ type: "shot", volume: 0.5 });
  assert.equal(sources.length, count);
  for (const source of sources) source.onended();
  assert.equal(m.snapshot().voices, 0);
  m.setMuted(false);
  const voice = m.play({ type: "blast", volume: 0.8, muffled: true });
  assert.equal(voice.filter.frequency.value, 450);
  assert.ok(energy(voice.source.buffer.data) > 0.02);
  voice.source.onended(); assert.equal(m.snapshot().voices, 0);
});

test("missing bundled recordings are an explicit error, never a silent beep fallback", () => {
  assert.throws(() => new A.Mixer(mockContext().context), /samples are missing/);
});
