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

test('all inline scripts parse', () => {
  for (const script of scripts) new vm.Script(script);
});

test('gameplay laser calls the exported cue for every shot', async () => {
  const audio = setup();
  const fireLaser = html.match(/function fireLaser\(tx, ty\) \{[\s\S]*?\n        \}/)[0];
  Object.assign(audio.context, {
    sfxLaser: audio.window.sfxLaser, barrelTip: () => ({ x: 1, y: 2 }),
    laserBeams: [], particles: [], rand: () => 1
  });
  vm.runInContext(`${fireLaser}; fireLaser(100, 100);`, audio.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(audio.sources.length, 2);
  assert.equal(audio.contexts[0].state, 'running');
  assert.equal(audio.gains[0].gain.value, 0.6);
  for (let shot = 0; shot < 10; shot++) vm.runInContext('fireLaser(100, 100)', audio.context);
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
    rockets: [], geodes: [], rocks: [], shards: [], gems: [], particles: [],
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

  const detonation = html.match(/if \(dist < 8\) \{([\s\S]*?)\n              continue;/)[1];
  vm.runInContext(`let i = 0; let rk = rockets[0]; ${detonation}`, audio.context);
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
