const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, 'geodes.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const audioScript = scripts.find(script => script.includes('function sfxLaser()'));

function setup() {
  const sources = [];
  const gains = [];
  const contexts = [];
  const errors = [];
  const gestures = {};
  const elements = {};
  const param = () => ({
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; }
  });
  const source = () => {
    const node = {
      frequency: param(),
      connect() {},
      disconnect() {},
      start(time) { sources.push({ node, time }); },
      stop(time) { this.stopTime = time; }
    };
    return node;
  };
  class AudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 1;
      this.sampleRate = 48000;
      this.destination = {};
      this.resumes = 0;
      contexts.push(this);
    }
    resume() {
      this.resumes++;
      return Promise.resolve().then(() => { this.state = 'running'; });
    }
    createGain() {
      const gain = { gain: param(), connect() {}, disconnect() {} };
      gains.push(gain);
      return gain;
    }
    createDynamicsCompressor() {
      return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {} };
    }
    createBuffer() { return { getChannelData: () => new Float32Array(48000) }; }
    createBufferSource() { return source(); }
    createOscillator() { return source(); }
    createBiquadFilter() { return { frequency: param(), Q: param(), connect() {}, disconnect() {} }; }
  }
  function element(id) {
    return elements[id] ??= {
      value: id === 'geoVolSlider' ? '60' : '',
      textContent: '0',
      handlers: {},
      classList: { toggle() {} },
      setAttribute() {},
      querySelector() { return null; },
      addEventListener(type, handler) { this.handlers[type] = handler; }
    };
  }
  const document = {
    getElementById: element,
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') handler(); }
  };
  const window = { AudioContext, addEventListener(type, handler) { gestures[type] = handler; } };
  const context = vm.createContext({
    window, document, console: { error: (...args) => errors.push(args) },
    MutationObserver: class { observe() {} }, setTimeout
  });
  vm.runInContext(audioScript, context);
  return { context, window, sources, gains, contexts, elements, gestures, errors };
}

function setupLaserGameplay(audio) {
  Object.assign(audio.context, {
    sfxLaser: audio.window.sfxLaser, barrelTip: () => ({ x: 1, y: 2 }),
    laserBeams: [], particles: [], rand: () => 1,
    running: true, gameOver: false, runTime: 0, laserHeat: 0, laserHeatUpdatedAt: 0,
    lastLaserShotAt: -Infinity, laserOverheatedUntil: 0,
    laserHeatChip: { classList: { toggle() {} } }, laserHeatEl: { textContent: '0%' },
    laserHeatBar: { value: 0 }
  });
  for (const declaration of html.matchAll(/const LASER_[A-Z_]+ = [^;]+;/g)) {
    vm.runInContext(declaration[0], audio.context);
  }
  for (const name of ['updateLaserHeat', 'fireLaser']) {
    const code = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`))[0];
    vm.runInContext(code, audio.context);
  }
}

test('all inline scripts parse', () => {
  for (const script of scripts) new vm.Script(script);
});

test('gameplay laser calls the exported cue for every shot', async () => {
  const audio = setup();
  setupLaserGameplay(audio);
  vm.runInContext('fireLaser(100, 100)', audio.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(audio.sources.length, 2);
  assert.equal(audio.contexts[0].state, 'running');
  assert.equal(audio.gains[0].gain.value, 0.6);
  for (let shot = 0; shot < 10; shot++) vm.runInContext('runTime += 1.3; fireLaser(100, 100)', audio.context);
  assert.equal(audio.sources.length, 22);
  assert.deepEqual(audio.errors, []);
});

test('mute and volume control the real mix and restore the previous level', async () => {
  const audio = setup();
  await audio.gestures.pointerdown();
  const slider = audio.elements.geoVolSlider;
  slider.value = '35';
  slider.handlers.input();
  assert.equal(audio.gains[0].gain.value, 0.35);
  audio.elements.muteBtn.handlers.click();
  audio.window.sfxLaser();
  assert.equal(audio.sources.length, 0);
  assert.equal(audio.gains[0].gain.value, 0);
  audio.elements.muteBtn.handlers.click();
  assert.equal(slider.value, '35');
  assert.equal(audio.gains[0].gain.value, 0.35);
  audio.window.sfxLaser();
  assert.equal(audio.sources.length, 2);
});

test('audio recovers from suspension before scheduling a shot', async () => {
  const audio = setup();
  await audio.window.sfxLaser();
  audio.contexts[0].state = 'suspended';
  await audio.window.sfxLaser();
  assert.equal(audio.contexts[0].resumes, 2);
  assert.equal(audio.sources.length, 4);
});

test('initial context respects volume selected before unlock', async () => {
  const audio = setup();
  audio.elements.geoVolSlider.value = '25';
  audio.elements.geoVolSlider.handlers.input();
  await audio.window.sfxLaser();
  assert.equal(audio.gains[0].gain.value, 0.25);
});

test('rocket launch and detonation are exported and generate audio', async () => {
  const audio = setup();
  await audio.window.sfxRocket();
  assert.equal(audio.sources.length, 3);
  audio.window.sfxExplosion();
  assert.equal(audio.sources.length, 8);
});

test('rocket flight loops once, stops, and restarts for resumed play', async () => {
  const audio = setup();
  await audio.window.setRocketFlightSound(true);
  const engine = audio.sources[0].node;
  assert.equal(engine.loop, true);
  audio.window.setRocketFlightSound(true);
  assert.equal(audio.sources.length, 1);
  audio.window.setRocketFlightSound(false);
  assert.equal(engine.stopTime, 1.05);
  assert.equal(audio.gains[1].gain.value, 0);
  audio.window.setRocketFlightSound(true);
  assert.equal(audio.sources.length, 2);
});

test('ending flight before context unlock does not leave a looping engine', async () => {
  const audio = setup();
  const unlocking = audio.window.setRocketFlightSound(true);
  audio.window.setRocketFlightSound(false);
  await unlocking;
  assert.equal(audio.sources.length, 0);
});

test('muting silences flight and prevents launch and detonation cues', async () => {
  const audio = setup();
  await audio.window.setRocketFlightSound(true);
  audio.elements.muteBtn.handlers.click();
  assert.equal(audio.gains[0].gain.value, 0);
  audio.window.sfxRocket();
  audio.window.sfxExplosion();
  assert.equal(audio.sources.length, 1);
  audio.elements.muteBtn.handlers.click();
  assert.equal(audio.gains[0].gain.value, 0.6);
  assert.equal(audio.sources.length, 1);
  audio.window.setRocketFlightSound(false);
});

test('gameplay launches rockets and stops flight audio on detonation and state changes', async () => {
  const audio = setup();
  await audio.gestures.pointerdown();
  const panel = { classList: { add() {}, remove() {} }, querySelector: () => ({}) };
  Object.assign(audio.context, {
    sfxRocket: audio.window.sfxRocket, sfxExplosion: audio.window.sfxExplosion,
    running: true, paused: false, gameOver: false, rocketCount: 1,
    rockets: [], geodes: [], rocks: [], shards: [], gems: [], particles: [], meteors: [],
    fireballs: [], laserBeams: [], tractorBeams: [], score: 0, missed: 0,
    overlay: panel, pauseVeil: panel, toolsEl: panel, introHtml: '',
    coarsePointer: false, barrelTip: () => ({ x: 10, y: 10 }),
    updateHUD() {}, buzz() {}, rand: () => 1, dist2: () => 0,
    getGeoHighScores: () => [], addGeoHighScore() {}
  });
  for (const name of ['launchRocket', 'rocketExplode', 'startGame', 'pauseGame', 'resetGame', 'endGame']) {
    const code = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`))[0];
    vm.runInContext(code, audio.context);
  }
  vm.runInContext('launchRocket(100, 100)', audio.context);
  assert.equal(audio.sources.length, 4);
  assert.equal(audio.sources[3].node.loop, true);

  vm.runInContext('pauseGame()', audio.context);
  assert.equal(audio.sources[3].node.stopTime, 1.05);
  vm.runInContext('startGame()', audio.context);
  assert.equal(audio.sources[4].node.loop, true);

  const arrival = html.match(/if \(dist <= Math\.max\(8, rk\.speed \* dt\)\) \{([\s\S]*?)\n              continue;/);
  vm.runInContext(`let i = 0; let rk = rockets[0]; ${arrival[1]}`, audio.context);
  assert.equal(audio.sources[4].node.stopTime, 1.05);
  assert.equal(audio.context.rockets.length, 0);
  assert.equal(audio.sources.length, 10);

  for (const command of ['resetGame()', 'endGame()']) {
    audio.window.setRocketFlightSound(true);
    const engine = audio.sources.at(-1).node;
    vm.runInContext(command, audio.context);
    assert.equal(engine.stopTime, 1.05);
  }
  assert.deepEqual(audio.errors, []);
});

test('laser rate limit and two-second overheat cannot be bypassed by sustained firing', async () => {
  const audio = setup();
  setupLaserGameplay(audio);
  await audio.gestures.pointerdown();
  assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), true);
  for (let i = 0; i < 100; i++) assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), false);
  audio.context.runTime = 0.149;
  assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), false);
  for (let shot = 1; shot <= 4; shot++) {
    audio.context.runTime = shot * 0.15;
    assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), true);
  }
  assert.equal(audio.context.laserOverheatedUntil, 2.6);
  assert.equal(audio.context.laserHeatEl.textContent, 'HOT');
  assert.equal(audio.sources.length, 13);
  for (let i = 0; i < 100; i++) {
    audio.context.runTime = 0.61 + i * 0.019;
    assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), false);
  }
  assert.equal(audio.sources.length, 13);
  audio.context.runTime = 2.6;
  assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), true);
  assert.equal(audio.context.laserHeat, 25);
  assert.equal(audio.sources.length, 15);
});

test('laser lockout prevents target damage and gem collection', () => {
  const audio = setup();
  setupLaserGameplay(audio);
  Object.assign(audio.context, {
    gun: { x: 0, y: 0 }, gems: [], rocks: [], geodes: [], fireballs: [], meteors: [],
    tractorBeams: [], dist2: () => 10000, buzz() {},
    makeShards() { throw Error('A rejected shot must not break a target'); },
    explodeFireball() { throw Error('A rejected shot must not explode a fireball'); },
    score: 0, laserOverheatedUntil: 2
  });
  for (const name of ['collectGem', 'strike']) {
    vm.runInContext(html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`))[0], audio.context);
  }
  for (const kind of ['rock', 'geode', 'fireball', 'gem', 'meteor']) {
    const obj = { x: 100, y: 100, points: 10 };
    audio.context.pickTarget = () => ({ kind, obj });
    const list = kind === 'gem' ? audio.context.gems : kind === 'rock' ? audio.context.rocks : kind === 'geode' ? audio.context.geodes : kind === 'meteor' ? audio.context.meteors : audio.context.fireballs;
    list.push(obj);
    vm.runInContext('strike(100, 100)', audio.context);
    assert.equal(list.includes(obj), true);
    assert.equal(obj.clicked, undefined);
  }
  assert.equal(audio.context.score, 0);
  assert.equal(audio.context.tractorBeams.length, 0);
  assert.equal(audio.sources.length, 0);
});

test('faster rockets retain ammo limits and can detonate within a full movement step', () => {
  const audio = setup();
  Object.assign(audio.context, {
    running: true, gameOver: false, rocketCount: 1, rockets: [],
    updateHUD() {}, barrelTip: () => ({ x: 0, y: 0 }), buzz() {},
    coarsePointer: false
  });
  audio.window.setRocketFlightSound = () => {};
  vm.runInContext(html.match(/function launchRocket\([^)]*\) \{[\s\S]*?\n        \}/)[0], audio.context);
  assert.equal(vm.runInContext('launchRocket(100, 100)', audio.context), true);
  assert.equal(audio.context.rockets[0].speed, 560);
  assert.equal(vm.runInContext('launchRocket(100, 100)', audio.context), false);
  audio.context.coarsePointer = true;
  audio.context.rocketCount = 1;
  vm.runInContext('launchRocket(100, 100)', audio.context);
  assert.equal(audio.context.rockets[1].speed, 680);
  const condition = html.match(/if \((dist <= Math\.max\(8, rk\.speed \* dt\))\)/)[1];
  Object.assign(audio.context, { dist: 20, dt: 0.033, rk: audio.context.rockets[1] });
  assert.equal(vm.runInContext(condition, audio.context), true);
});

function loadFunctions(audio, names) {
  for (const name of names) {
    const code = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n        \\}`))[0];
    vm.runInContext(code, audio.context);
  }
}

function setupMeteors(audio) {
  const types = [
    { name: 'amber', color: '#ffb300', points: 10 },
    { name: 'ruby', color: '#ff1744', points: 80 }
  ];
  let selected = 0;
  Object.assign(audio.context, {
    meteors: [], gems: [], particles: [], geodes: [], rocks: [], fireballs: [],
    tractorBeams: [], laserBeams: [], running: true, coarsePointer: false,
    gun: { x: 200, y: 600 }, canvas: { clientWidth: 400, clientHeight: 700 },
    chooseGemType: () => types[selected++ % types.length],
    rand: (a, b = 0) => (a + b) / 2, pace: () => 0.34, lite: false,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    dist2: (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2,
    makeShards() {}, makeSparkles() {}, updateHUD() {},
    endGame: reason => { audio.context.endedReason = reason; }
  });
  loadFunctions(audio, [
    'createGem', 'spawnMeteor', 'hitMeteor', 'destroyMeteor', 'updateMeteors',
    'meteorImpactPoint', 'firstMeteorOnSegment', 'rocketExplode',
    'imminentGeodeImpact', 'warnOfGeodeImpact'
  ]);
}

test('meteor needs exactly three laser hits and drops exactly five radial gems', async () => {
  const audio = setup();
  setupMeteors(audio);
  await audio.gestures.pointerdown();
  vm.runInContext('spawnMeteor()', audio.context);
  const m = audio.context.meteors[0];
  assert.equal(m.hp, 3);
  assert.equal(m.r, 27 * 0.74 * 2);
  audio.context.targetMeteor = m;
  for (let hit = 1; hit <= 2; hit++) {
    vm.runInContext('hitMeteor(targetMeteor)', audio.context);
    assert.equal(m.hp, 3 - hit);
    assert.equal(audio.context.gems.length, 0);
    assert.equal(audio.context.meteors.length, 1);
  }
  vm.runInContext('hitMeteor(targetMeteor)', audio.context);
  assert.equal(audio.context.meteors.length, 0);
  assert.equal(audio.context.gems.length, 5);
  const angles = audio.context.gems.map(g => Math.atan2(g.vy, g.vx));
  for (let i = 0; i < 5; i++) {
    const g = audio.context.gems[i];
    assert.equal(g.ttl, 8);
    assert.ok(Math.abs(Math.hypot(g.vx, g.vy) - 20) < 1e-10);
    if (i > 0) {
      const difference = (angles[i] - angles[i - 1] + Math.PI * 2) % (Math.PI * 2);
      assert.ok(Math.abs(difference - Math.PI * 2 / 5) < 1e-10);
    }
  }
  assert.equal(new Set(audio.context.gems.map(g => g.type)).size, 2);
  vm.runInContext('hitMeteor(targetMeteor)', audio.context);
  assert.equal(audio.context.gems.length, 5);
});

test('one rocket destroys a meteor and leaves all five gems free to collect', async () => {
  const audio = setup();
  setupMeteors(audio);
  await audio.gestures.pointerdown();
  vm.runInContext('spawnMeteor(); meteors[0].x = 200; meteors[0].y = 200; rocketExplode(200, 200)', audio.context);
  assert.equal(audio.context.meteors.length, 0);
  assert.equal(audio.context.gems.length, 5);
  assert.equal(audio.context.tractorBeams.length, 0);
});

test('meteor flight aims at the gun, outruns falling geodes, and detects gun impact', () => {
  const audio = setup();
  setupMeteors(audio);
  vm.runInContext('spawnMeteor()', audio.context);
  const m = audio.context.meteors[0];
  const before = Math.hypot(m.x - 200, m.y - 600);
  vm.runInContext('updateMeteors(0.1)', audio.context);
  const after = Math.hypot(m.x - 200, m.y - 600);
  assert.ok(Math.abs(before - after - 700 * 0.09 * 1.35 * 0.1) < 1e-9);
  assert.ok(Math.hypot(m.vx, m.vy) > 700 * 0.09);
  assert.ok(audio.context.particles.length > 0);
  m.x = 200; m.y = 599;
  vm.runInContext('updateMeteors(0.1)', audio.context);
  assert.equal(audio.context.endedReason, 'A meteor hit the gun.');
});

test('rocket swept collision finds a meteor between frames but ignores near misses', () => {
  const audio = setup();
  setupMeteors(audio);
  audio.context.meteors.push({ x: 50, y: 100, r: 20 });
  assert.equal(vm.runInContext('firstMeteorOnSegment(0, 100, 100, 100)', audio.context), audio.context.meteors[0]);
  assert.equal(vm.runInContext('firstMeteorOnSegment(0, 125, 100, 125)', audio.context), null);
});

test('collision alarm is trajectory-based and warns once per geode', async () => {
  const audio = setup();
  setupMeteors(audio);
  await audio.gestures.pointerdown();
  const imminent = { x: 200, y: 500, r: 20, vx: 0, fallSpeed: 100, phase: 'down' };
  audio.context.candidate = imminent;
  assert.equal(vm.runInContext('imminentGeodeImpact(candidate)', audio.context), true);
  for (const changes of [{ x: 350 }, { phase: 'up' }, { y: 100 }, { vx: 300 }]) {
    audio.context.candidate = { ...imminent, ...changes };
    assert.equal(vm.runInContext('imminentGeodeImpact(candidate)', audio.context), false);
  }
  audio.context.geodes.push(imminent, { ...imminent });
  for (let frame = 0; frame < 100; frame++) vm.runInContext('warnOfGeodeImpact()', audio.context);
  assert.equal(audio.sources.length, 4);
  assert.equal(audio.sources.at(-1).node.stopTime, 2);
  audio.window.stopCollisionAlarm();
  assert.equal(audio.sources.at(-1).node.stopTime, 1.025);
});

test('meteor roar stops on removal and cannot start after cancellation during unlock', async () => {
  const audio = setup();
  const pending = audio.window.setMeteorFlightSound(true);
  audio.window.setMeteorFlightSound(false);
  await pending;
  assert.equal(audio.sources.length, 0);
  audio.window.setMeteorFlightSound(true);
  const voice = audio.sources[0].node;
  assert.equal(voice.loop, true);
  audio.window.setMeteorFlightSound(false);
  assert.equal(voice.stopTime, 1.05);
});

test('paced laser shots cool between shots and lockout finishes with zero heat', async () => {
  const audio = setup();
  setupLaserGameplay(audio);
  await audio.gestures.pointerdown();
  for (let i = 0; i < 20; i++) {
    audio.context.runTime = i * 1.3;
    assert.equal(vm.runInContext('fireLaser(100, 100)', audio.context), true);
    assert.equal(audio.context.laserHeat, 25);
    assert.equal(audio.context.laserHeatBar.value, 25);
  }
  audio.context.laserHeat = 100;
  audio.context.laserOverheatedUntil = audio.context.runTime + 2;
  audio.context.runTime += 2;
  vm.runInContext('updateLaserHeat()', audio.context);
  assert.equal(audio.context.laserHeat, 0);
  assert.equal(audio.context.laserHeatBar.value, 0);
  assert.equal(audio.context.laserHeatEl.textContent, '0%');
});
