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
      disconnect() { this.disconnected = true; },
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
      const gain = { gain: param(), connect() {}, disconnect() { this.disconnected = true; } };
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

test('finished one-shot voices disconnect their nodes from the graph', async () => {
  const audio = setup();
  await audio.window.sfxLaser();
  audio.window.sfxExplosion();
  assert.ok(audio.sources.length >= 7);
  for (const { node } of audio.sources) {
    assert.equal(typeof node.onended, 'function');
    node.onended();
    assert.equal(node.disconnected, true);
  }
  const voiceGains = audio.gains.slice(1);
  assert.ok(voiceGains.length > 0);
  assert.ok(voiceGains.every(gain => gain.disconnected));
});

test('sounds requested while the context is suspended do not replay as a burst', async () => {
  const audio = setup();
  await audio.window.sfxLaser();
  const ctx = audio.contexts[0];
  let release;
  ctx.state = 'suspended';
  ctx.resume = function () {
    this.resumes++;
    return new Promise(resolve => { release = () => { this.state = 'running'; resolve(); }; });
  };
  const before = audio.sources.length;
  for (let shot = 0; shot < 200; shot++) {
    audio.window.sfxLaser();
    audio.window.sfxRocket();
    audio.window.sfxExplosion();
  }
  assert.equal(audio.sources.length, before);
  assert.equal(ctx.resumes, 2);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(audio.sources.length - before <= 2, `burst of ${audio.sources.length - before} voices`);
});

test('concurrent one-shot voices are capped', async () => {
  const audio = setup();
  await audio.window.sfxLaser();
  for (let i = 0; i < 500; i++) audio.window.sfxLaser();
  assert.ok(audio.sources.length <= 70, `${audio.sources.length} voices`);
  for (const { node } of audio.sources) node.onended();
  const before = audio.sources.length;
  audio.window.sfxLaser();
  assert.equal(audio.sources.length, before + 2);
});

test('explosion echo respects mute after it was scheduled', async () => {
  const audio = setup();
  await audio.gestures.pointerdown();
  audio.window.sfxExplosion();
  const afterHit = audio.sources.length;
  audio.elements.muteBtn.handlers.click();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(audio.sources.length, afterHit);
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
    fireballs: [], laserBeams: [], tractorBeams: [], shockwaves: [], pointPopups: [], score: 0, missed: 0,
    showPoints() {},
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
    rand: (a, b = 0) => (a + b) / 2, pace: () => 1, lite: false,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    dist2: (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2,
    makeShards() {}, makeSparkles() {}, updateHUD() {},
    shockwaves: [], pointPopups: [], SHOCKWAVE_MAX: 6, POINT_POPUP_MAX: 40, KNOCK_DAMPING: 3.5,
    endGame: reason => { audio.context.endedReason = reason; }
  });
  loadFunctions(audio, [
    'emitShockwave', 'showPoints', 'stepFlyer',
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

test('meteor flight aims at the gun at initial flyer speed and detects gun impact', () => {
  const audio = setup();
  setupMeteors(audio);
  vm.runInContext('spawnMeteor()', audio.context);
  const m = audio.context.meteors[0];
  const before = Math.hypot(m.x - 200, m.y - 600);
  vm.runInContext('updateMeteors(0.1)', audio.context);
  const after = Math.hypot(m.x - 200, m.y - 600);
  assert.ok(Math.abs(before - after - 700 * 0.055 * 0.1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(m.vx, m.vy) - 700 * 0.055) < 1e-9);
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

test('levels advance every 100 destroyed geodes and apply eight-percent speed steps', () => {
  const audio = setup();
  Object.assign(audio.context, { geodesCracked: 0, score: 0, runTime: 0 });
  loadFunctions(audio, ['level', 'pace']);
  for (const [destroyed, expectedLevel, speed] of [[0, 1, 1], [99, 1, 1], [100, 2, 1.08], [200, 3, 1.16]]) {
    audio.context.geodesCracked = destroyed;
    assert.equal(vm.runInContext('level()', audio.context), expectedLevel);
    assert.equal(vm.runInContext('pace()', audio.context), speed);
  }
  audio.context.score = 100000;
  audio.context.runTime = 10000;
  assert.equal(vm.runInContext('level()', audio.context), 3);
  Object.assign(audio.context, { rocketCount: 0, MISSILE_EVERY: 10, updateHUD() {}, buzz() {} });
  loadFunctions(audio, ['awardGeode']);
  audio.context.geodesCracked = 99;
  vm.runInContext('awardGeode()', audio.context);
  assert.equal(vm.runInContext('level()', audio.context), 2);
  assert.equal(audio.context.rocketCount, 1);
});

test('flyer arcs have symmetric vertical speeds and only a small natural collision minority', () => {
  const audio = setup();
  setupMeteors(audio);
  let seed = 12345;
  audio.context.rand = (a, b = 0) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return b + seed / 4294967296 * (a - b);
  };
  Object.assign(audio.context, {
    volcanoMouth: () => ({ x: 200, y: 490 }),
    eruptionPuff() {}, gun: { x: 200, y: 620 }, geodesCracked: 0
  });
  loadFunctions(audio, ['makeFlyer', 'stepFlyer', 'hitsGun', 'level', 'pace']);
  let hits = 0, left = 0, right = 0;
  for (let i = 0; i < 500; i++) {
    const flyer = vm.runInContext('makeFlyer(27)', audio.context);
    if (flyer.vx < 0) left++; else right++;
    audio.context.flyer = flyer;
    for (let frame = 0; frame < 2400; frame++) {
      vm.runInContext('stepFlyer(flyer, 0.033)', audio.context);
      if (vm.runInContext('hitsGun(flyer)', audio.context)) { hits++; break; }
      if (flyer.y > 728 || flyer.x < -flyer.r * 2 || flyer.x > 400 + flyer.r * 2) break;
    }
  }
  assert.ok(left > 200 && right > 200);
  assert.ok(hits / 500 > 0.01 && hits / 500 < 0.2, `Collision fraction: ${hits / 500}`);
  const g = vm.runInContext('makeFlyer(27)', audio.context);
  audio.context.flyer = g;
  const initialY = g.y;
  const peakTime = g.climb / g.gravity;
  vm.runInContext(`stepFlyer(flyer, ${peakTime / 2})`, audio.context);
  const ascentSpeed = Math.abs(g.vy), ascentY = g.y;
  vm.runInContext(`stepFlyer(flyer, ${peakTime})`, audio.context);
  assert.ok(Math.abs(g.vy - ascentSpeed) < 1e-8);
  assert.ok(Math.abs(g.y - ascentY) < 1e-8);
  vm.runInContext(`stepFlyer(flyer, ${peakTime / 2})`, audio.context);
  assert.ok(Math.abs(g.y - initialY) < 1e-8);
  assert.ok(g.vy <= g.climb);
  audio.context.geodesCracked = 100;
  const accelerated = vm.runInContext('makeFlyer(27)', audio.context);
  const startX = accelerated.x;
  audio.context.flyer = accelerated;
  vm.runInContext('stepFlyer(flyer, 1)', audio.context);
  assert.ok(Math.abs(accelerated.x - startX - accelerated.vx * 1.08) < 1e-8);
  vm.runInContext('spawnMeteor(); updateMeteors(0.1)', audio.context);
  assert.ok(Math.abs(Math.hypot(audio.context.meteors[0].vx, audio.context.meteors[0].vy) - 700 * 0.055 * 1.08) < 1e-8);
});

test('earning a missile plays one bounded fanfare that disconnects, and muting suppresses it', async () => {
  const audio = setup();
  Object.assign(audio.context, { geodesCracked: 0, rocketCount: 0, buzz() {}, updateHUD() {} });
  vm.runInContext('const MISSILE_EVERY = 10;', audio.context);
  loadFunctions(audio, ['awardGeode']);
  await audio.gestures.pointerdown();
  for (let i = 0; i < 9; i++) vm.runInContext('awardGeode()', audio.context);
  assert.equal(audio.sources.length, 0);
  vm.runInContext('awardGeode()', audio.context);
  assert.equal(audio.context.rocketCount, 1);
  assert.equal(audio.sources.length, 10);
  const freqs = audio.sources.map(s => s.node.frequency.value);
  assert.ok(freqs.includes(392) && freqs.includes(783.99), `fanfare notes, got ${freqs}`);
  // A second missile in the same burst (e.g. fireball) does not stack another fanfare.
  for (let i = 0; i < 10; i++) vm.runInContext('awardGeode()', audio.context);
  assert.equal(audio.context.rocketCount, 2);
  assert.equal(audio.sources.length, 10);
  for (const { node, time } of audio.sources) { assert.ok(node.stopTime > time); node.onended(); }
  assert.ok(audio.sources.every(({ node }) => node.disconnected));
  audio.contexts[0].currentTime += 5;
  audio.window.audioMuted = true;
  for (let i = 0; i < 10; i++) vm.runInContext('awardGeode()', audio.context);
  assert.equal(audio.context.rocketCount, 3);
  assert.equal(audio.sources.length, 10);
  audio.window.audioMuted = false;
  for (let i = 0; i < 9; i++) vm.runInContext('awardGeode()', audio.context);
  assert.equal(audio.sources.length, 10);
  assert.deepEqual(audio.errors, []);
});

test('destroying a meteor emits one shockwave that knocks nearby geodes and rocks outward only', async () => {
  const audio = setup();
  setupMeteors(audio);
  await audio.gestures.pointerdown();
  vm.runInContext('spawnMeteor(); meteors[0].x = 200; meteors[0].y = 300;', audio.context);
  const near = { x: 260, y: 300, r: 20, vx: 0, vy: 0 };
  const rock = { x: 200, y: 220, r: 15, vx: 0, vy: 0 };
  const far = { x: 20, y: 650, r: 20, vx: 0, vy: 0 };
  audio.context.geodes.push(near, far);
  audio.context.rocks.push(rock);
  audio.context.targetMeteor = audio.context.meteors[0];
  vm.runInContext('hitMeteor(targetMeteor); hitMeteor(targetMeteor)', audio.context);
  assert.equal(audio.context.shockwaves.length, 0, 'non-lethal hits do not emit a shockwave');
  vm.runInContext('hitMeteor(targetMeteor)', audio.context);
  assert.equal(audio.context.shockwaves.length, 1);
  assert.equal(audio.context.shockwaves[0].x, 200);
  assert.ok(near.kvx > 50 && Math.abs(near.kvy) < 1e-9, 'geode pushed right, away from meteor');
  assert.ok(rock.kvy < -50 && Math.abs(rock.kvx) < 1e-9, 'rock pushed up, away from meteor');
  assert.equal(far.kvx, undefined);
  assert.equal(audio.context.pointPopups.length, 0, 'meteors award no direct points');
  // Removing a meteor without destroying it (e.g. reset) makes no shockwave.
  vm.runInContext('spawnMeteor(); meteors.length = 0;', audio.context);
  assert.equal(audio.context.shockwaves.length, 1);
});

test('knockback decays so flyer arcs resume, and shockwaves and popups stay capped', () => {
  const audio = setup();
  setupMeteors(audio);
  const g = { x: 100, y: 300, r: 20, vx: 0, vy: 0, climb: 40, gravity: 0, age: 0, kvx: 260, kvy: 0 };
  for (let i = 0; i < 180; i++) vm.runInContext('stepFlyer(target, 1 / 60)', Object.assign(audio.context, { target: g }));
  assert.equal(g.kvx, 0);
  assert.ok(g.x > 160 && g.x < 100 + 260 / 3.5 + 5, `bounded displacement, got ${g.x}`);
  for (let i = 0; i < 20; i++) vm.runInContext('emitShockwave(0, 0, 150, 260)', audio.context);
  assert.equal(audio.context.shockwaves.length, 6);
  for (let i = 0; i < 100; i++) vm.runInContext('showPoints(0, 0, 5)', audio.context);
  vm.runInContext('showPoints(0, 0, 0)', audio.context);
  assert.equal(audio.context.pointPopups.length, 40);
  assert.ok(audio.context.pointPopups.every(p => p.text === '+5'));
});

test('rocket blast shows one +5 popup per rock matching the score awarded', () => {
  const audio = setup();
  setupMeteors(audio);
  audio.context.score = 0;
  audio.context.rocks.push({ x: 200, y: 200, r: 15, color: '#555' }, { x: 220, y: 200, r: 15, color: '#555' }, { x: 380, y: 600, r: 15 });
  vm.runInContext('rocketExplode(200, 200)', audio.context);
  assert.equal(audio.context.score, 10);
  assert.deepEqual(audio.context.pointPopups.map(p => [p.x, p.text]), [[220, '+5'], [200, '+5']]);
  assert.equal(audio.context.shockwaves.length, 0, 'rocket blasts without a meteor do not emit shockwaves');
});

test('fireball explosion shows popups that sum to the awarded points and emits a shockwave', () => {
  const audio = setup();
  setupMeteors(audio);
  Object.assign(audio.context, {
    score: 0, GEM_TYPES: [{ name: 'diamond', color: '#b9f2ff', points: 100 }],
    awardGeode() {}, spawnDiamond() {}, sfxExplosion() {}
  });
  loadFunctions(audio, ['explodeFireball']);
  audio.context.geodes.push({ x: 50, y: 50, r: 20 }, { x: 90, y: 50, r: 20 });
  audio.context.rocks.push({ x: 10, y: 10, r: 15 });
  vm.runInContext('explodeFireball({ x: 100, y: 100 })', audio.context);
  assert.equal(audio.context.score, 205);
  const total = audio.context.pointPopups.reduce((sum, p) => sum + Number(p.text.slice(1)), 0);
  assert.equal(total, 205);
  assert.equal(audio.context.shockwaves.length, 1);
  assert.equal(audio.context.geodes.length + audio.context.rocks.length, 0);
});
