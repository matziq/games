const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('crystal collection continues the game loop and preserves meteor/audio behavior in Chrome', { timeout: 45000 }, async () => {
  const executable = process.env.GEODES_TEST_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(fs.existsSync(executable), 'Set GEODES_TEST_BROWSER to an installed Chromium browser executable');
  const profile = fs.mkdtempSync('D:\\AI_Output\\geodes-meteor-browser-');
  const chrome = spawn(executable, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  let ws;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i++) {
      try {
        const candidate = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        if (/^\d+$/.test(candidate)) { port = candidate; break; }
      } catch (error) {
        if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error;
      }
      await wait(100);
    }
    assert.ok(port, 'Chrome debugging port did not become ready within ten seconds');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error) request.reject(message.error);
      else request.resolve(message.result);
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timeout = setTimeout(() => {
        pending.delete(key);
        reject(new Error(`Chrome timed out: ${method} ${params.expression || ''}`));
      }, 5000);
      pending.set(key, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, userGesture: true
      });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await call('Page.enable');
    await call('Page.navigate', { url: pathToFileURL(path.join(__dirname, 'geodes.html')).href });
    await wait(400);
    let html = (process.env.GEODES_TEST_URL
      ? await (await fetch(process.env.GEODES_TEST_URL)).text()
      : fs.readFileSync(path.join(__dirname, 'geodes.html'), 'utf8')).replace(/\r\n/g, '\n');
    const marker = 'requestAnimationFrame(loop);\n        updateHUD();';
    assert.ok(html.includes(marker));
    html = html.replace(marker, `window.__game = {
      spawnMeteor, strike, drawGun, rocketExplode, launchRocket, startGame, pauseGame,
      resetGame, endGame, loop: () => loop(lastTime + 33),
      meteors, gems, geodes, rocks, fireballs, rockets, gun, shockwaves, pointPopups, updateLaserHeat, tractorBeams,
      level, pace, gravity, awardGeode, get destroyed() { return geodesCracked; },
      set destroyed(v) { geodesCracked = v; },
      get score() { return score; },
      set score(v) { score = v; },
      get time() { return runTime; }, set time(v) { runTime = v; },
      get heat() { return laserHeat; }, set heat(v) { laserHeat = v; }, get overheat() { return laserOverheatedUntil; },
      fireLaser, laserHeatWarning,
      set ammo(v) { rocketCount = v; }
    };
    for (const name of ['drawRock', 'drawGun', 'drawGem', 'drawGeode', 'drawMeteor', 'drawFireball']) {
      const original = eval(name);
      eval(name + ' = function (o) { __metrics.drawOrder.push("' + name + '"); return original(o); }');
    }` + marker);
    html = html.replace('<body>', `<body><script>
      window.requestAnimationFrame = () => 0;
      window.__metrics = { sources: [], contexts: [], errors: [], drawnText: [], drawOrder: [], paints: [] };
      for (const name of ['fill', 'fillRect']) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) {
          if (__metrics.capturePaints) __metrics.paints.push({ color: this.fillStyle, shadow: this.shadowColor, blur: this.shadowBlur });
          return original.apply(this, args);
        };
      }
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
        if (/^[+][0-9]+$/.test(text)) __metrics.drawnText.push(text);
        return fillText.call(this, text, ...rest);
      };
      window.addEventListener('error', e => __metrics.errors.push(e.message));
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor() {
          super(); __metrics.contexts.push(this);
          this.meter = this.createAnalyser(); this.meter.fftSize = 2048;
          this.meter.connect(this.destination);
        }
        createDynamicsCompressor() {
          const node = super.createDynamicsCompressor(), connect = node.connect.bind(node);
          node.connect = target => connect(target === this.destination ? this.meter : target);
          return node;
        }
        createOscillator() {
          const node = super.createOscillator(), start = node.start.bind(node), disconnect = node.disconnect.bind(node);
          node.disconnect = (...args) => { node.__disconnected = true; return disconnect(...args); };
          node.start = (...args) => { __metrics.sources.push(node); return start(...args); };
          return node;
        }
        createBufferSource() {
          const node = super.createBufferSource(), start = node.start.bind(node), disconnect = node.disconnect.bind(node);
          node.disconnect = (...args) => { node.__disconnected = true; return disconnect(...args); };
          node.start = (...args) => { __metrics.sources.push(node); return start(...args); };
          return node;
        }
      };
    </script>`);
    const frame = (await call('Page.getFrameTree')).frameTree.frame.id;
    await call('Page.setDocumentContent', { frameId: frame, html });
    await wait(300);
    await evaluate("document.getElementById('playBtn').click()");
    await wait(100);
    await evaluate('__game.spawnMeteor(); __game.loop(33)');
    const flight = await evaluate(`(() => {
      const m = __game.meteors[0];
      return { hp: m.hp, r: m.r, speed: Math.hypot(m.vx, m.vy),
        loop: __metrics.sources.at(-1).loop, errors: __metrics.errors };
    })()`);
    assert.equal(flight.hp, 3);
    assert.equal(flight.loop, true);
    assert.deepEqual(flight.errors, []);
    for (const [destroyed, expectedLevel] of [[99, 1], [100, 2], [200, 3]]) {
      assert.equal(await evaluate(`__game.destroyed = ${destroyed}; __game.level()`), expectedLevel);
    }
    await evaluate('__game.destroyed = 0');
    for (const [width, height] of [[390, 844], [360, 640], [1280, 720], [740, 360]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate("window.dispatchEvent(new Event('resize'))");
      const gauge = await evaluate(`(() => {
        const r = document.getElementById('laserHeatChip').getBoundingClientRect();
        const c = document.getElementById('game').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
          gunY: c.top + __game.gun.y, parent: document.getElementById('laserHeatChip').parentElement.id };
      })()`);
      assert.ok(gauge.top > gauge.gunY, JSON.stringify(gauge));
      assert.ok(gauge.bottom <= height && gauge.left >= 0 && gauge.right <= width, JSON.stringify(gauge));
      assert.notEqual(gauge.parent, 'hud');
    }
    await call('Emulation.clearDeviceMetricsOverride');
    await evaluate("window.dispatchEvent(new Event('resize'))");
    await evaluate(`__game.resetGame(); __game.startGame(); __game.gems.push({
      type: 'ruby', color: '#ff1744', points: 80, x: 200, y: 250,
      r: 14, rot: 0, vrot: 0, vx: 0, vy: -20, life: 8, ttl: 8, alpha: 1
    }); __game.strike(200, 250)`);
    assert.equal(await evaluate('__game.gems.length'), 0);
    assert.equal(await evaluate('__game.tractorBeams.length'), 1);
    await evaluate('__game.loop(66)');
    const beforeCollection = await evaluate('__game.time');
    await evaluate('for (let i = 0; i < 120; i++) __game.loop(99 + i * 33)');
    assert.equal(await evaluate('__game.tractorBeams.length'), 0);
    assert.equal(await evaluate('__game.score'), 80);
    assert.ok(await evaluate('__game.time') > beforeCollection);
    await evaluate('__game.resetGame(); __game.startGame(); __game.spawnMeteor()');
    await evaluate('__game.meteors[0].x = 200; __game.meteors[0].y = 250');
    const initialMeteorRadius = await evaluate('__game.meteors[0].r');
    await evaluate('__game.strike(200, 250)');
    assert.ok(await evaluate('__game.meteors[0].r') < initialMeteorRadius);
    const damagedRadius = await evaluate('__game.meteors[0].r');
    await evaluate('__game.time += 0.2; __game.strike(200, 250)');
    assert.equal(await evaluate('__game.meteors[0].hp'), 1);
    assert.ok(await evaluate('__game.meteors[0].r') < damagedRadius);
    await evaluate('__game.time += 0.2; __game.strike(200, 250)');
    assert.equal(await evaluate('__game.gems.length'), 5);
    assert.equal(await evaluate('__game.meteors.length'), 0);
    const rms = `(() => {
      const c = __metrics.contexts[0], data = new Float32Array(c.meter.fftSize);
      c.meter.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    })()`;
    await wait(600);
    assert.ok(await evaluate(rms) < 0.001);
    await evaluate(`__game.resetGame(); __game.startGame(); __game.spawnMeteor();
      __game.meteors[0].x = 200; __game.meteors[0].y = 250;
      __game.rocketExplode(200, 250)`);
    assert.equal(await evaluate('__game.gems.length'), 5);
    assert.equal(await evaluate('__game.meteors.length'), 0);
    await wait(600);
    await evaluate(`__game.resetGame(); __game.startGame(); __game.spawnMeteor();
      __game.meteors[0].x = __game.gun.x; __game.meteors[0].y = __game.gun.y - 200;
      __game.ammo = 1; __game.launchRocket(__game.gun.x, __game.gun.y - 200);
      for (let i = 0; i < 25; i++) __game.loop(99 + i * 33)`);
    assert.equal(await evaluate('__game.meteors.length'), 0);
    assert.equal(await evaluate('__game.rockets.length'), 0);
    assert.equal(await evaluate('__game.gems.length'), 5);
    await wait(600);
    await evaluate(`__game.resetGame(); __game.startGame(); __game.geodes.push({
      x: __game.gun.x, y: __game.gun.y - 100, r: 20, vx: 0, fallSpeed: 100,
      phase: 'down', age: 2, rot: 0, color: '#222222', vy: 100, gravity: 1, climb: 100
    }); __game.loop(1000)`);
    await wait(100);
    assert.ok(await evaluate(rms) > 0.005);
    await evaluate('__game.pauseGame()');
    await wait(150);
    assert.ok(await evaluate(rms) < 0.001);
    await evaluate('__game.resetGame(); __game.startGame(); __game.spawnMeteor(); __game.pauseGame()');
    await wait(150);
    assert.ok(await evaluate(rms) < 0.001);
    await evaluate('__game.startGame()');
    await wait(200);
    assert.ok(await evaluate(rms) > 0.005);
    await evaluate("__game.endGame('Test impact')");
    await wait(600);
    assert.ok(await evaluate(rms) < 0.001);

    // Heat warnings follow real shot/cooldown transitions and actual canvas paint.
    await evaluate('__game.resetGame(); __game.startGame()');
    const gunPaint = `(() => {
      __metrics.paints.length = 0; __metrics.capturePaints = true;
      __game.drawGun(); __metrics.capturePaints = false;
      return __metrics.paints;
    })()`;
    assert.ok((await evaluate(gunPaint)).every(p => p.blur === 0));
    const beforeHeat = await evaluate('__metrics.sources.length');
    await evaluate('for (let i = 0; i < 3; i++) { __game.time = i * 0.15; __game.fireLaser(200, 100); }');
    assert.equal(await evaluate('__metrics.sources.length') - beforeHeat, 6);
    assert.ok((await evaluate(gunPaint)).every(p => p.blur === 0));
    await evaluate('__game.time = 0.45; __game.fireLaser(200, 100)');
    assert.equal(await evaluate('__game.heat'), 91);
    assert.equal(await evaluate('__metrics.sources.length') - beforeHeat, 10, 'one two-voice klaxon plus four laser zaps');
    const warningSource = beforeHeat + 6;
    assert.ok((await evaluate(gunPaint)).some(p => p.color === '#a8322c' && p.shadow === '#ff3b2f' && p.blur === 18));
    await evaluate('for (let i = 0; i < 100; i++) __game.updateLaserHeat()');
    assert.equal(await evaluate('__metrics.sources.length') - beforeHeat, 10, 'no per-frame klaxon spam');
    await evaluate('__game.time = 0.6; __game.fireLaser(200, 100)');
    assert.equal(await evaluate('__game.overheat'), 2.6);
    const duringLockout = await evaluate('__metrics.sources.length');
    await evaluate('for (let i = 0; i < 100; i++) __game.fireLaser(200, 100)');
    assert.equal(await evaluate('__metrics.sources.length'), duringLockout, 'rejected shots do not repeat warnings');
    await evaluate('__game.pauseGame(); __game.loop()');
    assert.equal(await evaluate('__game.time'), 0.6, 'pause freezes cooldown');
    assert.ok((await evaluate(gunPaint)).some(p => p.blur === 18), 'overheated gun stays red while paused');
    await evaluate('__game.startGame(); __game.time = 2.599; __game.updateLaserHeat()');
    assert.equal(await evaluate('__metrics.sources.length'), duringLockout, 'no steam before cooldown finishes');
    await wait(700);
    assert.equal(await evaluate(`__metrics.sources[${warningSource}].__disconnected`), true);
    assert.ok(await evaluate(rms) < 0.001, 'klaxon finishes');
    await evaluate('__game.time = 2.6; __game.updateLaserHeat(); __game.updateLaserHeat()');
    assert.equal(await evaluate('__metrics.sources.length'), duringLockout + 2, 'one two-voice steam burst on cooldown completion');
    assert.equal(await evaluate('__game.heat'), 0);
    assert.ok((await evaluate(gunPaint)).every(p => p.blur === 0), 'cooled gun loses red glow');
    await wait(100);
    assert.ok(await evaluate(rms) > 0.005, 'steam hiss is audible');
    await wait(1000);
    assert.equal(await evaluate('__metrics.sources.at(-1).__disconnected'), true);
    assert.ok(await evaluate(rms) < 0.001, 'steam voice finishes and disconnects');
    const afterSteam = await evaluate('__metrics.sources.length');
    await evaluate('__game.time = 4; __game.fireLaser(200, 100); __game.time = 6; __game.updateLaserHeat()');
    assert.equal(await evaluate('__metrics.sources.length'), afterSteam + 2, 'ordinary passive cooling does not vent');
    await evaluate('__game.resetGame(); __game.startGame(); document.getElementById("muteBtn").click()');
    const beforeMute = await evaluate('__metrics.sources.length');
    await evaluate(`for (let i = 0; i < 5; i++) { __game.time = i * 0.15; __game.fireLaser(200, 100); }
      __game.time = 2.6; __game.updateLaserHeat(); document.getElementById("muteBtn").click()`);
    assert.equal(await evaluate('__metrics.sources.length'), beforeMute, 'muted warnings/steam allocate no voices or delayed replay');
    await evaluate(`__game.resetGame(); __game.startGame();
      for (let i = 0; i < 5; i++) { __game.time = i * 0.15; __game.fireLaser(200, 100); }`);
    const beforeReset = await evaluate('__metrics.sources.length');
    await evaluate('__game.resetGame(); __game.time = 10; __game.updateLaserHeat()');
    assert.equal(await evaluate('__metrics.sources.length'), beforeReset, 'reset cancels overheat without steam');
    await wait(700);

    // A real suspended AudioContext must not accumulate a queue of new cue nodes.
    await evaluate(`(async () => {
      const ctx = __metrics.contexts[0]; await ctx.suspend();
      window.__resume = ctx.resume.bind(ctx);
      ctx.resume = () => new Promise(resolve => { window.__release = resolve; });
    })()`);
    const beforeSuspend = await evaluate('__metrics.sources.length');
    await evaluate('for (let i = 0; i < 100; i++) { sfxLaserWarning(); sfxLaserSteam(); } void 0');
    assert.equal(await evaluate('__metrics.sources.length'), beforeSuspend);
    await evaluate(`(async () => {
      const ctx = __metrics.contexts[0]; ctx.resume = __resume;
      await ctx.resume(); __release();
    })()`);
    await wait(100);
    assert.equal(await evaluate('__metrics.sources.length'), beforeSuspend + 2, 'only first suspended cue replays');
    await wait(700);
    assert.ok(await evaluate(rms) < 0.001);

    // Earning a missile plays the fanfare once.
    await evaluate('__game.resetGame(); __game.startGame(); __game.destroyed = 9');
    const beforeFanfare = await evaluate('__metrics.sources.length');
    await evaluate('__game.awardGeode()');
    assert.equal(await evaluate('__metrics.sources.length') - beforeFanfare, 10);
    await wait(250);
    assert.ok(await evaluate(rms) > 0.005, 'fanfare is audible');
    await wait(900);
    assert.ok(await evaluate(rms) < 0.001, 'fanfare finishes');

    // Destroying a meteor emits a shockwave that knocks a nearby geode and rock away.
    await evaluate(`__game.resetGame(); __game.startGame(); __game.spawnMeteor();
      __game.meteors[0].x = 200; __game.meteors[0].y = 250;
      const flyer = (x, y, r) => ({ x, y, r, vx: 0, vy: -1, climb: 40, gravity: 0, age: 1, rot: 0, spin: 0,
        phase: 'up', fallSpeed: 0, color: '#222222', seed: 1 });
      __game.geodes.push(flyer(300, 250, 20)); __game.rocks.push(flyer(200, 150, 16));
      for (let i = 0; i < 3; i++) { __game.time += 0.2; __game.strike(200, 250); }`);
    const wave = await evaluate(`({ meteors: __game.meteors.length, waves: __game.shockwaves.length,
      gx: __game.geodes[0].x, ry: __game.rocks[0].y, kvx: __game.geodes[0].kvx, kvy: __game.rocks[0].kvy })`);
    assert.deepEqual([wave.meteors, wave.waves], [0, 1]);
    assert.ok(wave.kvx > 50 && wave.kvy < -50, JSON.stringify(wave));
    await evaluate('for (let i = 0; i < 30; i++) __game.loop(99 + i * 33)');
    const pushed = await evaluate('({ gx: __game.geodes[0].x, ry: __game.rocks[0].y, waves: __game.shockwaves.length })');
    assert.ok(pushed.gx > wave.gx + 30 && pushed.ry < wave.ry - 30, JSON.stringify(pushed));
    assert.equal(pushed.waves, 0, 'shockwave ring is cleaned up');

    // Points are shown where they are awarded and then cleared.
    await evaluate(`__game.resetGame(); __game.startGame(); __metrics.drawnText.length = 0;
      __game.rocks.push({ x: 120, y: 200, r: 18, vx: 0, vy: -1, climb: 40, gravity: 0, age: 1, rot: 0, spin: 0,
        phase: 'up', fallSpeed: 0, color: '#555555', seed: 1 });
      __game.strike(120, 200); __game.loop(66)`);
    assert.equal(await evaluate('__game.score'), 5);
    assert.deepEqual(await evaluate('__game.pointPopups.map(p => p.text)'), ['+5']);
    assert.ok((await evaluate('__metrics.drawnText')).includes('+5'));
    await evaluate('for (let i = 0; i < 40; i++) __game.loop(99 + i * 33)');
    assert.equal(await evaluate('__game.pointPopups.length'), 0);

    // Actual frame rendering keeps gems/rocks/gun behind geodes and hazards.
    await evaluate(`__game.resetGame(); __game.startGame();
      const item = { x: 150, y: 200, r: 20, vx: 0, vy: 0, age: 0,
        rot: 0, spin: 0, phase: 'down', color: '#222222', seed: 1 };
      __game.rocks.push({ ...item }); __game.geodes.push({ ...item });
      __game.fireballs.push({ ...item, pulsePhase: 0 });
      __game.gems.push({ ...item, type: 'ruby', color: '#ff1744', points: 80, vrot: 0, alpha: 1 });
      __game.spawnMeteor(); __game.meteors[0].x = 150; __game.meteors[0].y = 200;
      __metrics.drawOrder.length = 0; __game.loop()`);
    const order = await evaluate('__metrics.drawOrder');
    for (const ordinary of ['drawRock', 'drawGun', 'drawGem']) {
      assert.ok(order.indexOf(ordinary) < order.indexOf('drawGeode'), JSON.stringify(order));
    }
    assert.ok(order.indexOf('drawGeode') < order.indexOf('drawMeteor'), JSON.stringify(order));
    assert.ok(order.indexOf('drawGeode') < order.indexOf('drawFireball'), JSON.stringify(order));

    // Laser at 80% heat glows red with one klaxon; recovering from overheat vents steam.
    await evaluate('__game.resetGame(); __game.startGame(); __game.geodes.length = 0; __game.rocks.length = 0; __game.fireballs.length = 0');
    const gunPixel = `(() => {
      const c = document.getElementById('game'), s = c.width / c.clientWidth;
      const d = c.getContext('2d').getImageData(Math.round((__game.gun.x - 45) * s), Math.round((__game.gun.y - 15) * s), 1, 1).data;
      return [d[0], d[1], d[2]];
    })()`;
    await evaluate('__game.loop()');
    const coolPixel = await evaluate(gunPixel);
    await evaluate(`__metrics.warn = 0; __metrics.steam = 0;
      for (const [name, key] of [['sfxLaserWarning', 'warn'], ['sfxLaserSteam', 'steam']]) {
        const original = window[name];
        window[name] = () => { __metrics[key]++; return original(); };
      }`);
    const beforeKlaxon = await evaluate('__metrics.sources.length');
    await evaluate(`__game.heat = 50; __game.fireLaser(__game.gun.x, 100);
      __game.time += 0.15; __game.fireLaser(__game.gun.x, 100)`);
    await wait(60);
    assert.ok(await evaluate(rms) > 0.005, 'klaxon is audible ' + await evaluate('__metrics.contexts[0].state'));
    assert.equal(await evaluate('__metrics.warn'), 1);
    assert.ok(await evaluate('__metrics.sources.length') - beforeKlaxon >= 6, 'two shots plus a two-voice klaxon');
    assert.equal(await evaluate('__game.laserHeatWarning()'), true);
    assert.ok(await evaluate("document.getElementById('laserHeatChip').classList.contains('warning')"));
    await evaluate('__game.loop()');
    const hotPixel = await evaluate(gunPixel);
    assert.ok(hotPixel[0] - hotPixel[1] > coolPixel[0] - coolPixel[1] + 40, JSON.stringify({ coolPixel, hotPixel }));
    await evaluate('__game.time += 0.15; __game.fireLaser(__game.gun.x, 100)');
    assert.ok(await evaluate('__game.overheat') > 0);
    await wait(800);
    const beforeSteam = await evaluate('__metrics.sources.length');
    await evaluate('__game.time = __game.overheat; __game.updateLaserHeat(); __game.updateLaserHeat()');
    assert.equal(await evaluate('__game.heat'), 0);
    assert.equal(await evaluate('__metrics.steam'), 1, 'one steam hiss');
    assert.equal(await evaluate('__metrics.warn'), 1, 'overheat does not repeat the klaxon');
    assert.ok(await evaluate('__metrics.sources.length') - beforeSteam >= 2, 'two-layer steam hiss');
    assert.equal(await evaluate('__game.laserHeatWarning()'), false);
    await wait(200);
    assert.ok(await evaluate(rms) > 0.005, 'steam is audible');
    await wait(1000);
    assert.ok(await evaluate(rms) < 0.001, 'steam finishes');

    // Gems do not fade/expire and their fall speeds increase at score thresholds.
    await evaluate(`__game.resetGame(); __game.startGame();
      __game.gems.push({ type: 'ruby', color: '#ff1744', points: 80, x: 150, y: 100,
        r: 14, rot: 0, vrot: 0, vx: 0, vy: 0, alpha: 1 });
      for (let i = 0; i < 250; i++) __game.loop()`);
    const falling = await evaluate(`({ n: __game.gems.length, alpha: __game.gems[0].alpha,
      vy: __game.gems[0].vy, y: __game.gems[0].y, gravity: __game.gravity() })`);
    assert.equal(falling.n, 1);
    assert.equal(falling.alpha, 1);
    assert.ok(falling.vy > 10 && falling.y > 100, JSON.stringify(falling));
    for (const [score, scale] of [[9999, 1], [10000, 1.1], [20000, 1.2]]) {
      const acceleration = await evaluate(`__game.score = ${score}; __game.gravity()`);
      assert.ok(Math.abs(acceleration - falling.gravity * scale) < 1e-9);
    }
    await evaluate(`__game.geodes.length = 0; __game.rocks.length = 0;
      __game.meteors.length = 0; __game.fireballs.length = 0;
      __game.gems[0].y = innerHeight + 20; __game.loop()`);
    assert.equal(await evaluate('__game.gems.length'), 0, 'offscreen gem is removed');
    assert.deepEqual(await evaluate('__metrics.errors'), []);
  } finally {
    if (ws) ws.close();
    chrome.kill();
    await exited;
    for (let i = 0; i < 20; i++) {
      try { fs.rmSync(profile, { recursive: true }); break; }
      catch (error) { if (i === 19) throw error; await wait(100); }
    }
  }
});
