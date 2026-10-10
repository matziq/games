const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('meteor gameplay, rendering, drops, klaxon, and flight sound cleanup in Chrome', { timeout: 30000 }, async () => {
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
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await wait(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(message.error);
      else request.resolve(message.result);
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
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
    let html = fs.readFileSync(path.join(__dirname, 'geodes.html'), 'utf8').replace(/\r\n/g, '\n');
    const marker = 'requestAnimationFrame(loop);\n        updateHUD();';
    assert.ok(html.includes(marker));
    html = html.replace(marker, `window.__game = {
      spawnMeteor, strike, rocketExplode, launchRocket, startGame, pauseGame,
      resetGame, endGame, loop, meteors, gems, geodes, rockets, gun, updateLaserHeat,
      get time() { return runTime; }, set time(v) { runTime = v; },
      get heat() { return laserHeat; }, get overheat() { return laserOverheatedUntil; },
      set ammo(v) { rocketCount = v; }
    };` + marker);
    html = html.replace('<body>', `<body><script>
      window.requestAnimationFrame = () => 0;
      window.__metrics = { sources: [], contexts: [], errors: [] };
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
          const node = super.createOscillator(), start = node.start.bind(node);
          node.start = (...args) => { __metrics.sources.push(node); return start(...args); };
          return node;
        }
        createBufferSource() {
          const node = super.createBufferSource(), start = node.start.bind(node);
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
    await evaluate(`__game.meteors[0].x = 200; __game.meteors[0].y = 250;
      __game.strike(200, 250); __game.time += 0.2; __game.strike(200, 250)`);
    assert.equal(await evaluate('__game.meteors[0].hp'), 1);
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
      phase: 'down', age: 2, rot: 0, color: '#222222'
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
