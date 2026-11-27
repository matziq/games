const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game({ AudioContext, storage, width = 960, height = 640 } = {}) {
  const calls = [];
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 100 });
      return (...args) => { if (key === 'fillRect') calls.push({ color: target.fillStyle, args }); };
    }
  });
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, value: '', textContent: '', classList: { add() {}, remove() {} },
      events: {}, addEventListener(name, fn) { this.events[name] = fn; },
      setPointerCapture() {}, setAttribute() {}, focus() {}, blur() {},
      getContext: () => context2d
    });
    return elements.get(id);
  }
  const document = {
    getElementById: element,
    createElement: () => ({ getContext: () => context2d }),
    querySelectorAll: () => [],
    querySelector: () => element('focus'),
    addEventListener() {}
  };
  const math = Object.create(Math);
  math.random = () => .5;
  const sandbox = {
    document, innerWidth: width, innerHeight: height, console: { warn() {} },
    localStorage: storage || { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }), addEventListener() {},
    requestAnimationFrame() {}, HTMLButtonElement: class {}, HTMLInputElement: class {},
    HTMLElement: class {}, onkeydown: null, onkeyup: null, Math: math, Set
  };
  sandbox.window = sandbox;
  if (AudioContext) Object.assign(sandbox, { AudioContext, setInterval: () => 1, clearInterval() {} });
  const html = fs.readFileSync(path.join(__dirname, '..', 'blood_joust.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const hook = `window.__test = {
    mkEnt, physEnt, doFlap, aiUpdate, collisions, updatePlaying, startGame, loop, drawBirdPx, resize, loseLife,
    advanceChain, pauseGame, resumeGame, syncHUD, tickEggs, spawnWave, advanceWave, buildPlatforms, layoutForWave,
    applyStats, updatePtero, pteroCollide, spawnPtero, pteroMouth, lanceTip, isRushWave, drawPtero, LAYOUTS,
    consts: { G, FLAP, MAXVY, spW, spH, EGG_W, EGG_H, LAVA_H, RUSH_HATCH, RUSH_BONUS, PTERO_SCORE, LAYOUT_EVERY },
    get: () => ({ player, enemies, plats, state, lives, score, fragments, teleports, frame, K, touchFlapHeld, chainCount, chainRemaining,
      wave, eggs, ptero, pteroT, layoutIdx, rushActive, rushTotal, rushHatched, invulnT, W, H }),
    set: v => {
      if ('player' in v) player = v.player;
      if ('enemies' in v) enemies = v.enemies;
      if ('state' in v) state = v.state;
      if ('lives' in v) lives = v.lives;
      if ('score' in v) score = v.score;
      if ('invulnT' in v) invulnT = v.invulnT;
      if ('respawnT' in v) respawnT = v.respawnT;
      if ('plats' in v) plats = v.plats;
      if ('eggs' in v) eggs = v.eggs;
      if ('wave' in v) wave = v.wave;
      if ('ptero' in v) ptero = v.ptero;
      if ('pteroT' in v) pteroT = v.pteroT;
      if ('layoutIdx' in v) { layoutIdx = v.layoutIdx; buildPlatforms(); }
    },
    setUpdate: fn => { update = fn; },
    sfx, setSfxMuted, setMusicMuted, audioState: () => ({ music, sfxMuted, musicMuted })
  };`;
  vm.runInNewContext(script.replace('    })();', hook + '\n    })();'), sandbox);
  return { t: sandbox.__test, sandbox, calls, context2d, element };
}

function joust(t, type = 'bloodKnight') {
  t.set({
    state: 'playing', invulnT: 0,
    player: t.mkEnt('player', 300, 250),
    enemies: [t.mkEnt(type, 300, 270)]
  });
  t.collisions();
}

test('joust chains multiply each enemy base score and refresh the window', () => {
  const { t, element } = game();
  t.startGame();
  joust(t);
  assert.equal(t.get().score, 100);
  t.advanceChain(2900);
  joust(t, 'shadowRider');
  assert.equal(t.get().score, 600);
  assert.equal(t.get().chainRemaining, 3000);
  t.advanceChain(2900);
  joust(t, 'deathLord');
  assert.equal(t.get().score, 2100);
  for (let i = 4; i <= 12; i++) joust(t);
  assert.equal(t.get().chainCount, 12, 'chain is not capped');
  t.syncHUD();
  assert.match(element('hud-chain').textContent, /CHAIN 12x \+1,200.*NEXT 13x 3.0s/);
  assert.match(element('chain-announcer').textContent, /Kill chain 12x/);
});

test('exactly three seconds chains, but a later kill starts at 1x', () => {
  for (const elapsed of [2999, 3000, 3001]) {
    const { t, element } = game();
    t.startGame();
    joust(t);
    t.advanceChain(elapsed);
    t.syncHUD();
    assert.equal(element('hud-chain').hidden, elapsed > 3000);
    joust(t);
    assert.equal(t.get().score, elapsed <= 3000 ? 300 : 200, `${elapsed}ms`);
    assert.equal(t.get().chainCount, elapsed <= 3000 ? 2 : 1);
  }
});

test('chain time is unscaled, freezes on pause, and runs during wave announcements', () => {
  const { t } = game();
  t.startGame(); joust(t);
  t.setUpdate(() => {});
  t.loop(100);
  t.loop(1100);
  assert.equal(t.get().chainRemaining, 2000);
  t.pauseGame();
  t.loop(11100);
  assert.equal(t.get().chainRemaining, 2000);
  t.resumeGame();
  t.loop(11200);
  t.loop(12200);
  assert.equal(t.get().chainRemaining, 1000);
  t.set({ state: 'waveAnnounce' });
  t.loop(13201);
  assert.equal(t.get().chainCount, 0);
});

test('life loss, game over, quit, and restart reset chains', () => {
  const { t, element } = game();
  for (const action of [
    () => t.loseLife(),
    () => { t.set({ lives: 1 }); t.loseLife(); },
    () => { t.pauseGame(); element('pause-quit').events.click(); },
    () => t.startGame()
  ]) {
    t.startGame(); joust(t); joust(t);
    action();
    assert.equal(t.get().chainCount, 0);
    assert.equal(t.get().chainRemaining, 0);
    assert.equal(element('chain-announcer').textContent, '');
  }
});

test('eggs keep their flat award without refreshing chains and hazard kills do not count', () => {
  const { t } = game();
  t.startGame(); joust(t);
  t.advanceChain(1000);
  const player = t.get().player;
  t.set({ plats: [], eggs: [{
    x: player.x + player.w / 2 - 6, y: player.y + player.h / 2 - 7,
    vx: 0, vy: 0, type: 'bloodKnight', landed: false, hatchTimer: 1000
  }] });
  t.tickEggs();
  assert.equal(t.get().score, 350);
  assert.equal(t.get().chainCount, 1);
  assert.equal(t.get().chainRemaining, 2000);
  const enemy = t.mkEnt('bloodKnight', 300, 600);
  t.physEnt(enemy, false);
  assert.equal(enemy.alive, false);
  assert.equal(t.get().score, 350);
  assert.equal(t.get().chainCount, 1);
});

test('active simulation advances at 80% without slowing menu updates', () => {
  for (const [state, expected] of [['playing', 48], ['title', 60]]) {
    const { t } = game();
    let updates = 0;
    t.set({ state });
    t.setUpdate(() => { updates++; });
    for (let i = 0; i <= 120; i++) t.loop(1 + i * 1000 / 120);
    assert.ok(Math.abs(updates - expected) <= 1, `${state}: ${updates}`);
  }
});

test('five successful enemy flaps trigger one second of active rest', () => {
  const { t } = game();
  t.startGame();
  const e = t.mkEnt('bloodKnight', 5, 200);
  e.patrolY = 100;
  e.aiTimer = 1000;
  for (let i = 0; i < 5; i++) {
    e.flapCD = 0;
    t.doFlap(e);
  }
  assert.equal(e.restT, 48);
  e.flapCD = 0;
  e.vy = 0;
  t.doFlap(e);
  assert.equal(e.vy, 0);
  t.set({ state: 'playing', player: null, enemies: [e], respawnT: 10000 });
  const startY = e.y;
  for (let i = 0; i < 47; i++) t.updatePlaying();
  assert.equal(e.restT, 1);
  assert.equal(e.flapCount, 0);
  assert.ok(e.y > startY, 'gravity moves the resting enemy down');
  t.updatePlaying();
  assert.equal(e.restT, 0);
  e.flapCD = 0;
  t.doFlap(e);
  assert.ok(e.flapCount > 0);
});

test('enemy steering descends above its target and flaps below it', () => {
  const { t } = game();
  t.set({ player: null, plats: [] });
  const actor = t.mkEnt('bloodKnight', 100, 100);
  actor.aiTimer = 100;
  actor.patrolY = 250;
  actor.vy = 3;
  t.aiUpdate(actor);
  assert.equal(actor.flapCount, 0);
  actor.y = 300;
  t.aiUpdate(actor);
  assert.equal(actor.flapCount, 1);
  assert.ok(actor.vy < 0);
});

test('enemy navigates toward the nearest edge under a solid platform', () => {
  const { t } = game();
  t.set({ player: null, plats: [{ x: 200, y: 200, w: 100, h: 22 }] });
  const actor = t.mkEnt('bloodKnight', 190, 225);
  actor.aiTimer = 100; actor.patrolY = 100; actor.patrolDir = 1;
  t.aiUpdate(actor);
  assert.ok(actor.vx < 0);
});

test('actors cannot tunnel through any side of a platform', () => {
  for (const type of ['player', 'bloodKnight']) {
    for (const [name, x, y, vx, vy, expectedAxis, expected] of [
      ['top', 210, 160, 0, 250, 'y', 164],
      ['bottom', 210, 300, 0, -250, 'y', 222],
      ['left', 0, 201, 300, 0, 'x', 148],
      ['right', 400, 201, -300, 0, 'x', 300]
    ]) {
      const { t } = game();
      t.set({ plats: [{ x: 200, y: 200, w: 100, h: 22 }] });
      const actor = t.mkEnt(type, x, y);
      actor.vx = vx; actor.vy = vy;
      t.physEnt(actor, type === 'player');
      assert.equal(actor[expectedAxis], expected, `${type} ${name}`);
    }
  }
});

test('solid platforms release overlaps and permit safe screen wrap', () => {
  const { t } = game();
  t.set({ plats: [{ x: 200, y: 200, w: 100, h: 22 }] });
  const actor = t.mkEnt('player', 210, 195);
  t.physEnt(actor, true);
  assert.ok(actor.y + actor.h <= 200 || actor.y >= 222 || actor.x + actor.w <= 200 || actor.x >= 300);
  actor.x = -actor.w * 1.2 - 1; actor.y = 250; actor.vx = -2; actor.vy = 0;
  t.physEnt(actor, true);
  assert.ok(actor.x > 960);
});

test('lances are short and mirrored by the sprite transform', () => {
  const { t, calls, context2d } = game();
  const col = { body: 'body', wing: 'wing', eye: 'eye', rider: 'rider', helm: 'helm', beak: 'beak', lance: 'lance' };
  t.drawBirdPx(context2d, col, 0, true);
  assert.deepEqual(calls.find(c => c.color === 'lance').args, [4, 16, 18, 2]);
  let mirrored = false;
  context2d.scale = (x, y) => { if (x === -1 && y === 1) mirrored = true; };
  t.drawBirdPx(context2d, col, 0, false);
  assert.equal(mirrored, true);
});

test('both joust defeat paths create colored body fragments', () => {
  for (const winner of ['player', 'enemy']) {
    const { t } = game();
    t.startGame();
    const player = t.mkEnt('player', 300, 250);
    const enemy = t.mkEnt('bloodKnight', 300, winner === 'player' ? 270 : 230);
    t.set({ state: 'playing', player, enemies: [enemy], invulnT: 0 });
    t.collisions();
    const result = t.get();
    const expectedType = winner === 'player' ? 'bloodKnight' : 'player';
    assert.deepEqual([...new Set(result.fragments.map(p => p.part))].sort(), ['arm', 'head', 'leg', 'wing']);
    assert.ok(result.fragments.every(p => p.type === expectedType));
  }
});

test('lava deaths also create body fragments', () => {
  for (const type of ['player', 'bloodKnight']) {
    const { t } = game();
    t.startGame();
    t.set({ plats: [] });
    const actor = t.mkEnt(type, 300, 600);
    t.physEnt(actor, type === 'player');
    assert.equal(actor.alive, false);
    assert.equal(t.get().fragments.length, 7);
    assert.ok(t.get().fragments.every(part => part.type === type));
  }
});

test('keyboard and simultaneous touch controls remain functional', () => {
  const { t, sandbox, element } = game();
  t.startGame();
  const player = t.get().player;
  t.set({ state: 'playing', invulnT: 999, enemies: [Object.assign(t.mkEnt('bloodKnight', 20, 20), { spawning: true })] });
  const event = { preventDefault() {}, pointerId: 1 };
  element('tc-left').events.pointerdown(event);
  element('tc-flap').events.pointerdown({ ...event, pointerId: 2 });
  t.updatePlaying();
  assert.ok(player.vx < 0 && player.vy < 0);
  element('tc-left').events.pointercancel(event);
  element('tc-flap').events.pointerup({ ...event, pointerId: 2 });
  assert.equal(t.get().K.ArrowLeft, 0);
  assert.equal(t.get().touchFlapHeld, false);
  player.vx = 0;
  sandbox.onkeydown({ code: 'KeyD', target: {}, preventDefault() {} });
  t.updatePlaying();
  assert.ok(player.vx > 0);
  sandbox.onkeyup({ code: 'KeyD' });
});

test('final life loss shows a structured result with a new personal best', () => {
  const { t, element } = game();
  t.startGame();
  t.set({ state: 'playing', lives: 2, score: 1500 });
  t.loop(1);
  assert.equal(element('hud').hidden, false);
  assert.equal(element('hud-score').textContent, '1,500');
  assert.match(element('hud-lives').innerHTML, /hud-life lost/);
  t.set({ lives: 1 });
  t.loseLife();
  t.loop(2);
  assert.equal(t.get().state, 'gameOver');
  assert.equal(element('hud').hidden, true);
  assert.equal(element('go-score').textContent, '1,500');
  assert.equal(element('go-best').textContent, '1,500');
  assert.equal(element('new-best').hidden, false);
  t.startGame();
  t.loop(3);
  assert.equal(element('new-best').hidden, false, 'flag is only rendered on game over');
  t.set({ lives: 1, score: 10 });
  t.loseLife();
  t.loop(4);
  assert.equal(element('new-best').hidden, true);
});

test('quitting from pause returns to the title and keeps the best score', () => {
  const { t, element } = game();
  t.startGame();
  t.set({ state: 'paused', score: 2400 });
  element('pause-quit').events.click();
  t.loop(1);
  assert.equal(t.get().state, 'title');
  assert.equal(element('title-best').hidden, false);
  assert.equal(element('title-best').textContent, 'Personal best: 2,400');
  assert.equal(element('touch-controls').hidden, true);
});
test('a touch flap tap shorter than one frame still flaps', () => {
  const { t, element } = game();
  t.startGame();
  const player = t.get().player;
  t.set({ state: 'playing', invulnT: 999, enemies: [Object.assign(t.mkEnt('bloodKnight', 20, 20), { spawning: true })] });
  const flap = element('tc-flap');
  flap.events.pointerdown({ pointerId: 7, preventDefault() {} });
  flap.events.pointerup({ pointerId: 7 });
  assert.equal(t.get().touchFlapHeld, false);
  t.updatePlaying();
  assert.ok(player.vy < 0, 'quick tap produced an upward flap');
});
function fakeAudio() {
  const log = { oscillators: 0, sources: 0, stopped: 0, ctx: null };
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = extra => Object.assign({ connect() {}, gain: param(), frequency: param(), Q: param(), pan: param(),
    playbackRate: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }, extra);
  class FakeAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); log.ctx = this; }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createStereoPanner() { return node(); }
    createOscillator() { log.oscillators++; return node({ start() {}, stop() { log.stopped++; } }); }
    createBufferSource() { log.sources++; return node({ start() {}, stop() {} }); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    decodeAudioData() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  return { FakeAudioContext, log };
}
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)) };
}

test('sound toggles persist and the music bed stops and restarts mid-game', () => {
  const { FakeAudioContext, log } = fakeAudio();
  const storage = memoryStorage();
  const { t } = game({ AudioContext: FakeAudioContext, storage });
  t.startGame();
  assert.ok(t.audioState().music, 'music starts with the game');
  t.setMusicMuted(true);
  assert.equal(t.audioState().music, null);
  assert.ok(log.stopped > 0, 'music voices were stopped');
  assert.equal(storage.getItem('bjMusicOff'), '1');
  t.setMusicMuted(false);
  assert.ok(t.audioState().music, 'unmuting during play restarts music');
  t.setSfxMuted(true);
  assert.equal(storage.getItem('bjSfxOff'), '1');

  const before = log.oscillators + log.sources;
  t.sfx('kill', 100);
  assert.equal(log.oscillators + log.sources, before, 'muted effects create no voices');

  const reloaded = game({ AudioContext: FakeAudioContext, storage }).t.audioState();
  assert.equal(reloaded.sfxMuted, true);
  assert.equal(reloaded.musicMuted, false);
});

test('rapidly repeated sound effects are rate-limited', () => {
  const { FakeAudioContext, log } = fakeAudio();
  const { t } = game({ AudioContext: FakeAudioContext });
  t.sfx('flap', 100);
  const first = log.oscillators + log.sources;
  assert.ok(first > 0, 'first flap is audible');
  t.sfx('flap', 100);
  assert.equal(log.oscillators + log.sources, first, 'same-instant repeat is skipped');
  log.ctx.currentTime = .2;
  t.sfx('flap', 100);
  assert.ok(log.oscillators + log.sources > first, 'later flap plays');
});

// ─── Gameplay update: flight, egg rush, smart riders, layouts, side lava, pterodactyl ───

function holdAltitude(t, frames = 480) {
  t.startGame(); t.set({ state: 'playing', plats: [], enemies: [], invulnT: 0 });
  const p = t.mkEnt('player', 400, 300); t.set({ player: p });
  let flaps = 0;
  for (let f = 0; f < frames; f++) {
    if (p.y >= 300 && p.vy > 0 && !p.flapCD) { t.doFlap(p); flaps++; }
    t.physEnt(p, true);
  }
  return flaps;
}

test('flight is a relaxed flap, rise, hang, and fall rhythm', () => {
  const { t } = game();
  assert.ok(holdAltitude(t) <= 9, 'holding altitude for 10 s takes at most 9 flaps (was 14)');
  const q = t.mkEnt('player', 400, 300); t.set({ player: q }); t.doFlap(q);
  let top = 300, apexFrame = 0, back = 0, hang = 0;
  for (let f = 1; f < 300; f++) {
    t.physEnt(q, true);
    if (q.y < top) { top = q.y; apexFrame = f; }
    if (Math.abs(q.vy) < 1.2) hang++;
    if (q.y >= 300) { back = f; break; }
  }
  assert.ok(300 - top >= 65, `one flap rises ${300 - top}px`);
  assert.ok(apexFrame >= 25, 'the climb slows over half a second');
  assert.ok(hang >= 18, 'it hangs near the apex before falling');
  assert.ok(back >= 55, 'one flap keeps the rider aloft for over a second');
  for (let f = 0; f < 120; f++) t.physEnt(q, true);
  assert.ok(q.vy <= t.consts.MAXVY && t.consts.MAXVY <= 6, 'falls are capped at a readable speed');
});

test('every fourth wave is an egg rush with fast hatch timers and a perfect bonus', () => {
  const { t, element } = game();
  t.startGame();
  for (const n of [1, 2, 3, 5, 8]) assert.equal(t.isRushWave(n), n % 4 === 0);
  t.set({ wave: 4 }); t.spawnWave();
  const s = t.get();
  assert.equal(s.rushActive, true);
  assert.equal(s.enemies.length, 0, 'no riders spawn during the rush');
  assert.equal(s.eggs.length, 10);
  const base = s.plats[s.plats.length - 1];
  const keys = new Set();
  for (const eg of s.eggs) {
    assert.ok(eg.landed && eg.rush && eg.hatchTime === t.consts.RUSH_HATCH);
    const p = s.plats[eg.onPlat];
    assert.ok(eg.x >= p.x - 1 && eg.x + t.consts.EGG_W <= p.x + p.w + 1, 'egg sits on its platform');
    assert.ok(Math.abs(eg.x + 6 - (base.x + base.w / 2)) > 60 || p !== base, 'not on the spawn point');
    keys.add(`${eg.onPlat}:${Math.round(eg.x)}`);
  }
  assert.equal(keys.size, s.eggs.length, 'no stacked eggs');
  t.set({ state: 'playing', player: null, lives: 3, respawnT: 9999 });
  t.syncHUD();
  assert.match(element('hud-rush').textContent, /EGG RUSH 10\/10 LEFT \| HATCH IN 8\.8s/);
  // First egg hatches exactly at the rush deadline.
  const first = s.eggs[0];
  for (let f = 0; f < t.consts.RUSH_HATCH - 1; f++) t.tickEggs();
  assert.ok(t.get().eggs.includes(first), 'still an egg one frame before the deadline');
  t.tickEggs();
  assert.ok(!t.get().eggs.includes(first));
  assert.equal(t.get().rushHatched, 1);
});

test('rush eggs can be grabbed through the spawn shield and a clean sweep pays 1,000', () => {
  const { t } = game();
  t.startGame(); t.set({ wave: 4 }); t.spawnWave();
  t.set({ state: 'playing', score: 0 });
  for (const eg of t.get().eggs.slice()) {
    t.set({ invulnT: 100, player: t.mkEnt('player', eg.x - 20, eg.y - 15) });
    t.tickEggs();
  }
  assert.equal(t.get().eggs.length, 0);
  assert.equal(t.get().score, 2500);
  t.advanceWave();
  assert.equal(t.get().score, 3500, 'perfect rush bonus');
  assert.equal(t.get().wave, 5);
  assert.equal(t.get().rushActive, false);
  // A rush with any hatched egg earns no bonus.
  const g = game().t;
  g.startGame(); g.set({ wave: 8 }); g.spawnWave(); g.set({ state: 'playing', player: null, respawnT: 9999, score: 0 });
  for (let f = 0; f < t.consts.RUSH_HATCH; f++) g.tickEggs();
  g.set({ eggs: [], enemies: [] }); g.advanceWave();
  assert.equal(g.get().score, 0);
});

test('purple and gray riders are faster, climb above the player, and dodge lava', () => {
  const { t } = game();
  t.startGame();
  const mk = type => { const e = t.mkEnt(type, 300, 300); t.applyStats(e); return e; };
  const knight = mk('bloodKnight'), shadow = mk('shadowRider'), lord = mk('deathLord');
  assert.deepEqual([knight.speed, knight.smart], [.65, false], 'green knights are unchanged');
  assert.ok(shadow.speed > 1.1 && lord.speed > 1.4 && shadow.smart && lord.smart);
  const H = t.get().H;
  for (const [e, expectFlap] of [[knight, false], [shadow, true], [lord, true]]) {
    t.set({ player: Object.assign(t.mkEnt('player', 600, 300), { vx: 3 }) });
    Object.assign(e, { aiMode: 'chase', aiTimer: 999, patrolY: H * .45, vy: 0 });
    t.aiUpdate(e);
    assert.equal(e.vy < 0, expectFlap, `${e.type} seeks height above the player`);
  }
  // Lava escape overrides the post-flap rest only for smart riders.
  for (const [type, expectFlap] of [['bloodKnight', false], ['deathLord', true]]) {
    const e = mk(type);
    Object.assign(e, { y: H - t.consts.LAVA_H - 100 - e.h, aiMode: 'patrol', aiTimer: 999, patrolY: H - t.consts.LAVA_H - 100 - e.h, restT: 30, vy: 2 });
    t.aiUpdate(e);
    assert.equal(e.vy < 0, expectFlap, `${type} lava escape`);
  }
  // Out-climbed at close range, a smart rider breaks away instead of charging.
  const e = mk('shadowRider');
  Object.assign(e, { aiMode: 'chase', aiTimer: 999, vx: 0 });
  t.set({ player: t.mkEnt('player', 340, 240) });
  t.aiUpdate(e);
  assert.ok(e.vx < 0, 'retreats away from a higher player');
});

const SIZES = [[960, 640], [1600, 640], [390, 844], [720, 800]];

test('the arena layout, size, and color change every three waves', () => {
  const { t } = game();
  assert.deepEqual([1, 2, 3, 4, 6, 7, 10, 13].map(t.layoutForWave), [0, 0, 0, 1, 1, 2, 3, 0]);
  const palettes = new Set(t.LAYOUTS.map(l => l.pal.body));
  assert.equal(palettes.size, t.LAYOUTS.length, 'each layout has its own color');
  t.startGame();
  const before = t.get().plats.map(p => [p.x, p.y, p.w].map(Math.round).join());
  t.set({ wave: 3, state: 'playing', enemies: [], eggs: [] });
  t.advanceWave();
  const s = t.get();
  assert.equal(s.layoutIdx, 1);
  const after = s.plats.map(p => [p.x, p.y, p.w].map(Math.round).join());
  assert.notDeepEqual(after, before);
  const base = s.plats[s.plats.length - 1];
  assert.equal(s.player.y, base.y - s.player.h, 'player re-materializes on the new base');
  assert.ok(s.invulnT > 0);
  t.set({ wave: 4, enemies: [], eggs: [] }); t.advanceWave();
  assert.equal(t.get().layoutIdx, 1, 'layout holds between changes');
});

test('every layout keeps clearance between stacked ledges and opens both lava shafts', () => {
  for (const [width, height] of SIZES) {
    const { t } = game({ width, height });
    const { spW, spH, LAVA_H } = t.consts;
    for (let li = 0; li < t.LAYOUTS.length; li++) {
      t.set({ layoutIdx: li });
      const { plats, W, H } = t.get();
      const label = `${t.LAYOUTS[li].name} at ${W}x${H}`;
      for (const p of plats) {
        assert.ok(p.x >= 0 && p.x + p.w <= W && p.y >= H * .18 - 1 && p.y + p.h < H - LAVA_H, `${label} in bounds, below the HUD band`);
        if (p.y > H * .3) assert.ok(p.x >= spW + 12 && p.x + p.w <= W - spW - 12, `${label} side shafts`);
      }
      for (const a of plats) for (const b of plats) {
        if (a === b || a.x >= b.x + b.w || a.x + a.w <= b.x || a.y > b.y) continue;
        assert.ok(b.y - (a.y + a.h) >= spH + 8, `${label} clearance`);
      }
      // A rider dropping down either side ends in the lava.
      for (const x of [4, W - spW - 4]) {
        const e = t.mkEnt('bloodKnight', x, H * .35);
        let f = 0;
        while (e.alive && f++ < 400) t.physEnt(e, false);
        assert.equal(e.alive, false, `${label} lava at x=${x}`);
      }
    }
  }
});

function pteroAt(t, phase, left = true) {
  const p = { type: 'ptero', x: 500, y: 250, vx: 0, vy: 0, w: 84, h: 34, left, phase, phaseT: 99, life: 999, turnCD: 99, clashCD: 0, wing: 0 };
  t.set({ ptero: p, state: 'playing', invulnT: 0 });
  return p;
}
function playerWithTipInMouth(t, p, faceLeft) {
  const m = t.pteroMouth(p), e = t.mkEnt('player', 0, 0);
  e.left = faceLeft;
  const tip = t.lanceTip(e);
  e.x = m.x + m.w / 2 - tip.x; e.y = m.y + m.h / 2 - tip.y;
  t.set({ player: e });
  return e;
}

test('pterodactyls visit from wave 3 and never during egg rushes', () => {
  const { t, element } = game();
  t.startGame();
  for (const [n, expected] of [[1, false], [2, false], [3, true], [4, false], [5, true]]) {
    t.set({ wave: n }); t.spawnWave();
    assert.equal(t.get().pteroT > 0, expected, `wave ${n}`);
  }
  t.set({ wave: 3, state: 'playing', pteroT: 1 });
  t.updatePtero();
  assert.ok(t.get().ptero, 'appears when its timer elapses');
  assert.match(element('announcer').textContent, /Lance its open mouth while it roars/);
  // Telegraph: fly -> windup -> roar -> fly.
  const p = t.get().ptero; p.phaseT = 1;
  t.updatePtero(); assert.equal(p.phase, 'windup');
  p.phaseT = 1; t.updatePtero(); assert.equal(p.phase, 'roar');
  p.phaseT = 1; t.updatePtero(); assert.equal(p.phase, 'fly');
  // It does not block wave completion.
  t.set({ enemies: [], eggs: [], player: t.mkEnt('player', 100, 100), invulnT: 99 });
  t.updatePlaying();
  assert.equal(t.get().wave, 4);
});

test('only a lance in the open, roaring mouth kills the pterodactyl', () => {
  for (const left of [true, false]) {
    const { t } = game();
    t.startGame(); t.set({ score: 0 });
    const p = pteroAt(t, 'roar', left);
    playerWithTipInMouth(t, p, !left);
    t.pteroCollide();
    assert.equal(t.get().ptero, null, `facing ${left ? 'left' : 'right'}`);
    assert.equal(t.get().score, t.consts.PTERO_SCORE);
    assert.equal(t.get().player.alive, true);
  }
});

test('closed jaws deflect the lance, and every other touch is fatal', () => {
  const { t } = game();
  t.startGame();
  // Closed mouth (flying or winding up): bounce, nobody dies.
  for (const phase of ['fly', 'windup']) {
    const p = pteroAt(t, phase);
    const e = playerWithTipInMouth(t, p, false);
    t.pteroCollide();
    assert.ok(t.get().ptero && e.alive && e.vx < 0, `${phase} clash`);
  }
  const cases = {
    'lance pointed away': (p) => playerWithTipInMouth(t, p, true),
    'stomp from above': (p) => Object.assign(t.mkEnt('player', p.x + 20, p.y + 16 - t.consts.spH), { left: true, vy: 3 }),
    'ram the body': (p) => Object.assign(t.mkEnt('player', p.x + 30, p.y), { left: true }),
    'hit from behind': (p) => Object.assign(t.mkEnt('player', p.x + p.w - 20, p.y), { left: true }),
  };
  for (const [label, make] of Object.entries(cases)) {
    t.set({ lives: 3 });
    const p = pteroAt(t, 'roar');
    const e = make(p); t.set({ player: e });
    t.pteroCollide();
    assert.equal(e.alive, false, `${label} kills the player`);
    assert.ok(t.get().ptero, `${label} leaves the pterodactyl alive`);
  }
  // The respawn shield prevents body damage but still never kills the pterodactyl.
  const p = pteroAt(t, 'roar');
  const e = t.mkEnt('player', p.x + 30, p.y); t.set({ player: e, invulnT: 50 });
  t.pteroCollide();
  assert.ok(e.alive && t.get().ptero);
  // Regular joust collisions ignore it.
  t.set({ enemies: [], invulnT: 0 }); t.collisions();
  assert.ok(t.get().ptero);
});

test('a pterodactyl kill joins the kill chain', () => {
  const { t } = game();
  t.startGame(); t.set({ score: 0 });
  joust(t);
  const p = pteroAt(t, 'roar');
  playerWithTipInMouth(t, p, false);
  t.pteroCollide();
  assert.equal(t.get().score, 100 + 2 * t.consts.PTERO_SCORE);
  assert.equal(t.get().chainCount, 2);
});
