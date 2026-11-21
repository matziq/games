const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
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
    document, innerWidth: 960, innerHeight: 640, console: { warn() {} },
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }), addEventListener() {},
    requestAnimationFrame() {}, HTMLButtonElement: class {}, HTMLInputElement: class {},
    HTMLElement: class {}, onkeydown: null, onkeyup: null, Math: math, Set
  };
  sandbox.window = sandbox;
  const html = fs.readFileSync(path.join(__dirname, '..', 'blood_joust.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const hook = `window.__test = {
    mkEnt, physEnt, doFlap, aiUpdate, collisions, updatePlaying, startGame, loop, drawBirdPx, resize,
    get: () => ({ player, enemies, plats, state, lives, score, fragments, teleports, frame, K, touchFlapHeld }),
    set: v => {
      if ('player' in v) player = v.player;
      if ('enemies' in v) enemies = v.enemies;
      if ('state' in v) state = v.state;
      if ('lives' in v) lives = v.lives;
      if ('invulnT' in v) invulnT = v.invulnT;
      if ('respawnT' in v) respawnT = v.respawnT;
      if ('plats' in v) plats = v.plats;
    },
    setUpdate: fn => { update = fn; }
  };`;
  vm.runInNewContext(script.replace('    })();', hook + '\n    })();'), sandbox);
  return { t: sandbox.__test, sandbox, calls, context2d, element };
}

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
