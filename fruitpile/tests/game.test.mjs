import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.argv[2] || String.raw`D:\AI_Output\Fruitpile_PC_and_mobile`);
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(output, 'browsers');
// FRUITPILE_TOOLS optionally points at an existing Playwright install (a folder holding node_modules).
const tools = path.resolve(process.env.FRUITPILE_TOOLS || path.join(output, 'tools'));
const require = createRequire(path.join(tools, 'package.json'));
const { chromium } = require('playwright');
const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const htmlPath = path.join(output, `FruitPile-${version}.html`);
const html = fs.readFileSync(htmlPath, 'utf8');
const artifacts = path.join(output, 'tests');
fs.mkdirSync(artifacts, { recursive: true });

// Test-only instrumentation is injected into a routed copy, never the release.
const hook = `
window.testGame = {
  state: () => ({running, paused, simTime, score, runChaos, settings: {...settings},
    current: currentFruit.key, next: nextFruit.key, dropCount, swapUsed, largestCreated,
    diamondsCreated, bestCombo, comboCount, inputX: input.x,
    pending: matchQueue.length + mergedClusterSweeps.length,
    bodies: Composite.allBodies(world).filter(isFruitBody).map(b => ({id:b.id,key:b.plugin.fruitKey,x:b.position.x,y:b.position.y,vx:b.velocity.x,vy:b.velocity.y,armed:!!b.plugin.armedUntil})),
    world: {...playfield}, key: fpHsKey(),
    runArcade, chainStep, level, credits, continueOffered, gravity: world.gravity.y,
    arcadeClass: app.classList.contains('arcade'), scoreText: scoreEl.textContent}),
  begin: () => { newGame(); audio.setVolume(0); cancelAnimationFrame(rafId); lastT=100; },
  stopRaf: () => cancelAnimationFrame(rafId),
  frames: (count, dt=1000/60) => { for(let i=0;i<count;i++){tick(lastT+dt); cancelAnimationFrame(rafId);} },
  pair: (key='cherry', separation) => {
    const f=fruitByKey.get(key);
    const apart = separation == null ? f.radius * 2 - 1 : separation;
    const a=fruitBodyAt(260-apart/2,500,f), b=fruitBodyAt(260+apart/2,500,f);
    World.add(world,[a,b]); return [a.id,b.id];
  },
  hold: (ids) => {
    const saved = ids.map(id => { const b = Composite.get(world, id, 'body'); return { id, x: b.position.x, y: b.position.y }; });
    const original = Engine.update.bind(Engine);
    Engine.update = (engine, delta) => {
      const result = original(engine, delta);
      for (const s of saved) {
        const b = Composite.get(world, s.id, 'body');
        if (!b || removedIds.has(b.id)) continue;
        Body.setPosition(b, { x: s.x, y: s.y });
        Body.setVelocity(b, { x: 0, y: 0 });
        Body.setAngularVelocity(b, 0);
      }
      return result;
    };
    return () => { Engine.update = original; };
  },
  separate: (id, x) => {
    const b = Composite.get(world, id, 'body');
    Body.setPosition(b, { x, y: 500 });
    Body.setVelocity(b, { x: 0, y: 0 });
  },
  mergePair: key => {
    const f=fruitByKey.get(key), a=fruitBodyAt(260-f.radius,500,f), b=fruitBodyAt(260+f.radius,500,f);
    World.add(world,[a,b]); mergeCluster([a,b],Composite.allBodies(world)); checkWinCondition(); updateHud();
  },
  danger: () => {
    const b=fruitBodyAt(260,150,fruitByKey.get('apple')); b.plugin.bornAt=-10000;
    Body.setStatic(b,true); World.add(world,b);
  },
  points: key => basePointsForFruit(key),
  fuse: n => desiredFuseMsForClusterSize(n),
  end: () => endGame(),
  scores: () => getFpHighScores(),
  save: (score,name) => addFpHighScore(score,name),
  setScore: value => { score=value; updateHud(); },
  queue: (a,b) => {currentFruit=fruitByKey.get(a);nextFruit=fruitByKey.get(b);updateHud();},
  idleFruit: () => { const b=fruitBodyAt(260,600,fruitByKey.get('apple')); b.plugin.lastActivityAt=-20000; World.add(world,b); },
  seedRandom: () => {let s=42;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);},
  flies: () => Composite.allBodies(world).filter(isFruitBody).map(b => ({key:b.plugin.fruitKey, fly:!!b.plugin.flyStartedAt})),
  plantFly: () => {
    const apple = fruitBodyAt(180, 500, fruitByKey.get('apple'));
    apple.plugin.flyStartedAt = nowMs() - 500;
    apple.plugin.lastActivityAt = nowMs() - 30000;
    const grape = fruitBodyAt(340, 500, fruitByKey.get('grape'));
    grape.plugin.lastActivityAt = nowMs();
    const peach = fruitBodyAt(250, 640, fruitByKey.get('peach'));
    peach.plugin.lastActivityAt = nowMs();
    World.add(world, [apple, grape, peach]);
    return { apple: apple.id, grape: grape.id };
  },
  scare: (hostId, hitterId) => scareFly(Composite.get(world, hostId, 'body'), Composite.get(world, hitterId, 'body')),
  masses: () => FRUITS.map(f => ({ key: f.key, radius: f.radius, mass: fruitBodyAt(0, 0, f).mass })),
  fall: (key) => {
    const b = fruitBodyAt(260, 200, fruitByKey.get(key));
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    World.add(world, b);
    for (let i = 0; i < 20; i++) Engine.update(engine, 1000 / 60);
    return { y: b.position.y, vy: b.velocity.y };
  },
  strike: (key) => {
    const savedGravity = world.gravity.y;
    world.gravity.y = 0;
    const targetFruit = fruitByKey.get('cherry');
    const strikerFruit = fruitByKey.get(key);
    const target = fruitBodyAt(260, 350, targetFruit);
    const striker = fruitBodyAt(260, 350 - targetFruit.radius - strikerFruit.radius - 6, strikerFruit);
    for (const b of [target, striker]) {
      Body.setVelocity(b, { x: 0, y: 0 });
      Body.setAngularVelocity(b, 0);
    }
    Body.setVelocity(striker, { x: 0, y: 6 });
    World.add(world, [target, striker]);
    const start = { x: target.position.x, y: target.position.y };
    let peak = 0;
    for (let i = 0; i < 35; i++) {
      Engine.update(engine, 1000 / 60);
      peak = Math.max(peak, Math.hypot(target.velocity.x, target.velocity.y));
    }
    world.gravity.y = savedGravity;
    return { strikerMass: striker.mass, targetMove: Math.hypot(target.position.x - start.x, target.position.y - start.y), peak };
  },
  freezeFruit: () => { for (const b of Composite.allBodies(world)) if (isFruitBody(b)) Body.setStatic(b, true); },
  setChaos: (on) => { settings.chaos = !!on; },
  setArcade: (on) => { settings.arcade = !!on; applyArcade(); },
  dropN: n => { for (let i = 0; i < n; i++) { input.lastDropAt = -Infinity; dropGate.awaitingImpact = false; dropGate.credits = 2; dropFruit(260); } },
  audioState: () => audio.ctx ? audio.ctx.state : 'none',
  aim: x => { input.x = x; }
};
`;
assert.equal((html.match(/            start\(\);/g) || []).length, 1);
const testHtml = html.replace('            start();', `${hook}\n            start();`);
const browser = await chromium.launch({
    headless: true,
    ...(process.env.FRUITPILE_CHROME_PATH ? { executablePath: process.env.FRUITPILE_CHROME_PATH } : {})
});
const results = [];
// FRUITPILE_TEST_FILTER=<text>[|<text>...] runs only the tests whose name contains one of the texts.
const testFilters = (process.env.FRUITPILE_TEST_FILTER || '').toLowerCase().split('|').filter(Boolean);
async function test(name, fn) {
    if (testFilters.length && !testFilters.some(f => name.toLowerCase().includes(f))) return;
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
}
async function setup(size = { width: 1280, height: 800 }, touch = false, instrument = true, initScript = '') {
    const context = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    const errors = [];
    const requests = [];
    if (initScript) await context.addInitScript({ content: initScript });
    await context.route('**/*', route => {
        const url = route.request().url();
        requests.push(url);
        if (url === 'https://fruitpile.test/') return route.fulfill({ contentType: 'text/html', body: instrument ? testHtml : html });
        return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://fruitpile.test/');
    await page.locator('#btnPlay').waitFor();
    if (instrument) await page.evaluate(() => testGame.stopRaf());
    return { page, context, errors, requests };
}
const state = page => page.evaluate(() => testGame.state());
const rects = (page, ids) => page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const b = document.getElementById(id).getBoundingClientRect();
    return [id, { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }];
})), ids);
const centerOf = async (page, selector) => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
// Single-finger touch driven through the DevTools protocol, so press, drag and release can be separated.
async function touchPad(context, page) {
    const cdp = await context.newCDPSession(page);
    return (type, x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0 }] });
}
const settle = page => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 40)));
const openMoreSettings = page => page.evaluate(() => { document.getElementById('moreSettings').open = true; });
// Auto-opened dialogs ignore pointer clicks for a moment so a tap aimed at the bowl cannot land on a button.
const passTapGuard = page => page.waitForTimeout(500);
// Stands in for navigator.vibrate so the page's vibration calls can be read back.
const vibrationProbe = `
    window.__vibes = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { window.__vibes.push(pattern); return true; } });
`;
// Stands in for the Android shell's FruitPileNative JavaScript interface.
const nativeProbe = canVibrate => `
    window.__native = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__native.push(['web-vibrate']); return true; } });
    window.FruitPileNative = {
        canVibrate: () => ${canVibrate},
        vibrate: ms => window.__native.push(['vibrate', ms]),
        vibratePattern: csv => window.__native.push(['pattern', csv]),
        keepAwake: on => window.__native.push(['awake', on])
    };
`;
const unavailableAudioProbe = `
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
`;
const partialAudioGraphProbe = `
    window.__closedAudioContexts = 0;
    class PartialAudioContext {
        constructor() { this.destination = {}; this.state = 'running'; }
        createGain() { throw new Error('test gain creation failure'); }
        close() {
            window.__closedAudioContexts++;
            this.state = 'closed';
            return Promise.resolve();
        }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: PartialAudioContext });
`;
const rejectedAudioResumeProbe = `
    window.__audioResumes = 0;
    Object.defineProperty(window.AudioContext.prototype, 'resume', {
        configurable: true,
        value() {
            window.__audioResumes++;
            return Promise.reject(new Error('Synthetic audio resume rejection'));
        }
    });
`;
try {
    await test('Touching fruit merge, score, and use the documented fuse', async () => {
        const { page, context, errors } = await setup();
        await page.evaluate(() => {
            testGame.begin();
            const ids = testGame.pair();
            const release = testGame.hold(ids);
            try { testGame.frames(150); } finally { release(); }
        });
        const s = await state(page);
        assert.equal(s.score, 50);
        assert.deepEqual(s.bodies.map(b => b.key), ['grape']);
        assert.equal(await page.evaluate(() => testGame.fuse(2)), 750);
        assert.equal(await page.evaluate(() => testGame.fuse(4)), 1250);
        const points = await page.evaluate(() => [testGame.points('cherry'), testGame.points('watermelon')]);
        assert(points[1] > points[0]);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Larger match groups merge once after the extended fuse', async () => {
        const { page, context, errors } = await setup();
        const result = await page.evaluate(() => {
            testGame.begin();
            const ids = [...testGame.pair(), ...testGame.pair()];
            const release = testGame.hold(ids);
            try {
                testGame.frames(55);
                const before = testGame.state();
                testGame.frames(70);
                return { before, after: testGame.state() };
            } finally { release(); }
        });
        assert.equal(result.before.score, 0, JSON.stringify(result.before));
        assert.equal(result.before.bodies.length, 4);
        assert.equal(result.after.score, 100);
        assert.deepEqual(result.after.bodies.map(b => b.key), ['grape']);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Two diamonds retain the merge shockwave and bonus', async () => {
        const { page, context, errors } = await setup();
        const result = await page.evaluate(() => {
            testGame.begin();
            testGame.idleFruit();
            testGame.mergePair('diamond');
            testGame.frames(1);
            return testGame.state();
        });
        assert.equal(result.score, 101250);
        assert.deepEqual(result.bodies.map(b => b.key), ['apple']);
        assert(Math.abs(result.bodies[0].vx) + Math.abs(result.bodies[0].vy) > 0.1);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Legacy mode preference starts merge and preserves existing scores and settings', async () => {
        const seed = `
            if (!localStorage.getItem('seeded')) {
                localStorage.setItem('seeded', '1');
                localStorage.setItem('fruitpile.mode', 'explode');
                localStorage.setItem('fruitpile.settings.v2', JSON.stringify({volume: 0, reduced: true, chaos: false}));
                localStorage.setItem('fruitpile.highscores.v2', JSON.stringify({
                    'merge.classic': [{score: 1250, name: 'ACE', date: '2026-01-01'}],
                    'merge.chaos': [{score: 900, name: 'BEE', date: '2026-01-01'}],
                    'explode.classic': [{score: 300, name: 'OLD', date: '2026-01-01'}]
                }));
            }
        `;
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true, true, seed);
        assert.equal(await page.locator('#btnModeExplode, #btnModeMerge').count(), 0);
        assert.equal(await page.locator('#volSlider').inputValue(), '0');
        assert(await page.locator('#reducedEffects').isChecked());
        await page.locator('#btnHow').click();
        assert.doesNotMatch(await page.locator('#infoBody').innerText(), /explod|explosion/i);
        await page.locator('#btnHow').click();
        await page.locator('#btnScores').click();
        const leaderboard = await page.locator('#fp-hs-wrap').innerText();
        assert.match(leaderboard, /ACE/);
        assert.doesNotMatch(leaderboard, /OLD/);
        await page.locator('#fpHsClose').click();
        await page.locator('#btnPlay').click();
        await page.evaluate(() => {
            testGame.stopRaf();
            const ids = testGame.pair();
            const release = testGame.hold(ids);
            try { testGame.frames(150); } finally { release(); }
        });
        assert.deepEqual((await state(page)).bodies.map(b => b.key), ['grape']);
        await page.evaluate(() => testGame.save(1500, 'NEW'));
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fruitpile.highscores.v2')));
        assert.deepEqual(stored['merge.classic'].map(row => row.name), ['NEW', 'ACE']);
        assert.equal(stored['merge.chaos'][0].name, 'BEE');
        assert.equal(stored['explode.classic'][0].name, 'OLD');
        assert.equal(await page.evaluate(() => localStorage.getItem('fruitpile.mode')), 'explode');
        await page.evaluate(() => { testGame.setChaos(true); testGame.begin(); });
        assert.equal((await page.evaluate(() => testGame.scores()))[0].name, 'BEE');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Fixed step gives the same simulation at 30, 60 and 120 Hz', async () => {
        const outcomes = [];
        for (const hz of [30, 60, 120]) {
            const { page, context } = await setup();
            await page.evaluate(hz => {
                testGame.seedRandom();
                testGame.begin();
                const ids = testGame.pair();
                const release = testGame.hold(ids);
                try { testGame.frames(hz * 3, 1000 / hz); } finally { release(); }
            }, hz);
            outcomes.push(await state(page));
            await context.close();
        }
        for (const s of outcomes.slice(1)) {
            assert(Math.abs(s.simTime - outcomes[0].simTime) <= 17);
            assert.equal(s.score, outcomes[0].score);
            assert.equal(s.bodies.length, outcomes[0].bodies.length);
            assert(Math.abs(s.bodies[0].y - outcomes[0].bodies[0].y) < 1);
        }
    });
    await test('Mouse, keyboard, swap limits, cancel, multi-pointer and release outside', async () => {
        const { page, context, errors } = await setup();
        await page.evaluate(() => testGame.begin());
        const box = await page.locator('#game').boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
        assert.equal((await state(page)).dropCount, 1);
        await page.evaluate(() => testGame.frames(30));
        await page.locator('#game').focus();
        const before = (await state(page)).inputX;
        await page.keyboard.press('ArrowRight');
        assert((await state(page)).inputX > before);
        await page.keyboard.press('Space');
        assert.equal((await state(page)).dropCount, 2);
        await page.evaluate(() => { testGame.queue('cherry', 'grape'); });
        await page.keyboard.press('s');
        assert.equal((await state(page)).current, 'grape');
        await page.keyboard.press('s');
        assert.equal((await state(page)).current, 'grape');
        await page.evaluate(() => testGame.frames(180));
        const drops = (await state(page)).dropCount;
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.locator('#game').dispatchEvent('pointercancel', { pointerId: 1 });
        await page.mouse.up();
        assert.equal((await state(page)).dropCount, drops);
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.mouse.move(0, 0);
        await page.mouse.up();
        assert.equal((await state(page)).dropCount, drops);
        await page.locator('#game').dispatchEvent('pointerup', { pointerId: 777, isPrimary: false });
        assert.equal((await state(page)).dropCount, drops);
        await page.mouse.click(box.x + 100, box.y + 100, { button: 'right' });
        assert.equal((await state(page)).dropCount, drops);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Pause/help/scores/background freeze physics and fuse; restart clears all queues', async () => {
        const { page, context, errors } = await setup();
        await page.evaluate(() => { testGame.begin(); const ids = testGame.pair(); window.__releaseHold = testGame.hold(ids); testGame.frames(20); });
        await page.locator('#btnPause').click();
        const before = await state(page);
        await page.evaluate(() => testGame.frames(500));
        assert.deepEqual((await state(page)).bodies, before.bodies);
        assert.equal((await state(page)).simTime, before.simTime);
        await page.locator('#btnHow').click();
        await page.evaluate(() => testGame.frames(500));
        assert.equal((await state(page)).simTime, before.simTime);
        await page.locator('#btnScores').click();
        await page.locator('#fpHsClose').click();
        await page.locator('#btnPlay').click();
        await page.evaluate(() => { testGame.stopRaf(); testGame.frames(150); window.__releaseHold(); });
        assert((await state(page)).score > 0);
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        const hidden = await state(page);
        await page.evaluate(() => { testGame.frames(500); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal((await state(page)).simTime, hidden.simTime);
        assert.equal((await state(page)).paused, true);
        await page.locator('#btnNew').click();
        assert.equal((await state(page)).paused, true);
        await page.locator('#btnNew').click();
        await page.evaluate(() => testGame.stopRaf());
        const fresh = await state(page);
        assert.equal(fresh.pending, 0);
        assert.equal(fresh.bodies.length, 0);
        assert.equal(fresh.dropCount, 0);
        assert.equal(fresh.score, 0);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Settings reload, Classic versus Chaos, and separated local score tables', async () => {
        const { page, context, errors } = await setup();
        await page.locator('#volSlider').fill('0');
        await openMoreSettings(page);
        await page.locator('#reducedEffects').check();
        await page.locator('#chaosMode').check();
        await page.reload();
        await page.evaluate(() => testGame.stopRaf());
        assert.equal(await page.locator('#volSlider').inputValue(), '0');
        assert(await page.locator('#reducedEffects').isChecked());
        assert(await page.locator('#chaosMode').isChecked());
        await page.evaluate(() => { testGame.begin(); testGame.idleFruit(); testGame.frames(300); });
        assert.equal((await state(page)).runChaos, true);
        assert.equal((await state(page)).bodies[0].key, 'orange');
        await page.evaluate(() => { testGame.save(1000, 'TEST'); });
        assert.equal((await page.evaluate(() => testGame.scores()))[0].score, 1000);
        await page.locator('#btnPause').click();
        await openMoreSettings(page);
        await page.locator('#chaosMode').uncheck();
        await page.evaluate(() => { testGame.begin(); testGame.idleFruit(); testGame.frames(200); });
        assert.equal((await state(page)).bodies[0].key, 'apple');
        assert.equal((await page.evaluate(() => testGame.scores())).length, 0);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Merge stays in contact, and a hit moves the fruit fly onto another fruit', async () => {
        const { page, context, errors } = await setup();
        const result = await page.evaluate(() => {
            testGame.begin();
            const bounced = testGame.pair('cherry');
            const releaseBounce = testGame.hold(bounced);
            try { testGame.frames(20); } finally { releaseBounce(); }
            const armedBeforeSeparation = testGame.state().bodies.every(b => b.armed);
            testGame.separate(bounced[1], 70);
            testGame.frames(120);
            const separatedState = testGame.state();
            const separated = separatedState.bodies.map(b => b.key).sort();
            testGame.begin();
            const held = testGame.pair('cherry', 20);
            const releaseHeld = testGame.hold(held);
            try { testGame.frames(80); } finally { releaseHeld(); }
            const merged = testGame.state().bodies.map(b => b.key);
            testGame.setChaos(true);
            testGame.begin();
            const planted = testGame.plantFly();
            testGame.scare(planted.apple, planted.grape);
            testGame.freezeFruit();
            const moved = testGame.flies();
            testGame.frames(140);
            const beforeOldDeadline = testGame.flies();
            testGame.frames(180);
            return { armedBeforeSeparation, separated, separatedState, merged, moved, beforeOldDeadline, later: testGame.flies() };
        });
        assert(result.armedBeforeSeparation);
        assert.deepEqual(result.separated, ['cherry', 'cherry']);
        assert(result.separatedState.bodies.every(b => !b.armed));
        assert.equal(result.separatedState.pending, 0);
        assert.deepEqual(result.merged, ['grape']);
        assert.equal(result.moved.find(b => b.key === 'apple').fly, false);
        assert.equal(result.moved.find(b => b.key === 'peach').fly, true);
        assert.equal(result.moved.find(b => b.key === 'grape').fly, false);
        assert(result.beforeOldDeadline.some(b => b.key === 'peach'), JSON.stringify(result.beforeOldDeadline));
        assert(!result.later.some(b => b.key === 'peach'), JSON.stringify(result.later));
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Larger fruit have more mass and move the same target farther', async () => {
        const { page, context, errors } = await setup();
        const result = await page.evaluate(() => {
            testGame.begin();
            const masses = testGame.masses();
            const cherryFall = testGame.fall('cherry');
            testGame.begin();
            const melonFall = testGame.fall('watermelon');
            testGame.begin();
            const cherryHit = testGame.strike('cherry');
            testGame.begin();
            const melonHit = testGame.strike('watermelon');
            return { masses, cherryFall, melonFall, cherryHit, melonHit };
        });
        for (let i = 1; i < result.masses.length; i++) {
            assert(result.masses[i].mass > result.masses[i - 1].mass, JSON.stringify(result.masses));
        }
        const cherry = result.masses.find(f => f.key === 'cherry');
        const melon = result.masses.find(f => f.key === 'watermelon');
        const radiusRatio = melon.radius / cherry.radius;
        const massRatio = melon.mass / cherry.mass;
        assert(massRatio > radiusRatio ** 2.5 && massRatio < radiusRatio ** 3.5, JSON.stringify({ massRatio, radiusRatio }));
        assert(Math.abs(result.cherryFall.y - result.melonFall.y) < 1, JSON.stringify(result));
        assert(result.melonHit.targetMove > result.cherryHit.targetMove * 1.6, JSON.stringify(result));
        assert(result.melonHit.peak > result.cherryHit.peak * 1.6, JSON.stringify(result));
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Diamond milestone preserves the run and overflow has a visible grace period', async () => {
        const { page, context, errors } = await setup();
        await page.evaluate(() => { testGame.begin(); testGame.mergePair('watermelon'); });
        assert.equal((await state(page)).diamondsCreated, 1);
        assert.equal((await state(page)).paused, true);
        assert.equal(await page.locator('#modalTitle').innerText(), 'Your first diamond!');
        await page.locator('#btnPlay').click();
        assert.equal((await state(page)).paused, true, 'a tap right as the milestone opens is ignored');
        await passTapGuard(page);
        await page.locator('#btnPlay').click();
        await page.evaluate(() => testGame.stopRaf());
        assert.equal((await state(page)).diamondsCreated, 1);
        await page.evaluate(() => { testGame.begin(); testGame.danger(); testGame.frames(100); });
        assert.equal((await state(page)).running, true);
        assert.match(await page.locator('#danger').innerText(), /Clear the line/);
        await page.evaluate(() => testGame.frames(100));
        assert.equal((await state(page)).running, false);
        assert.equal(await page.locator('#modalTitle').innerText(), 'Bowl full');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('320px, portrait, landscape, tablet and desktop retain controls and board geometry', async () => {
        const sizes = [[320, 568], [390, 844], [667, 375], [844, 390], [768, 1024], [900, 561], [1024, 600], [1440, 900]];
        for (const [width, height] of sizes) {
            const { page, context, errors } = await setup({ width, height }, width < 900);
            await page.screenshot({ path: path.join(artifacts, `menu-${width}x${height}.png`) });
            await page.locator('#btnPlay').click();
            await page.evaluate(() => { testGame.stopRaf(); testGame.queue('watermelon', 'watermelon'); });
            const metrics = await page.evaluate(() => {
                const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
                const intersects = (a,b) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0
                    && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
                const hud = rect(document.querySelector('.hud'));
                const arena = rect(document.querySelector('#arena'));
                const controlsBox = rect(document.querySelector('#controls'));
                const menuLink = rect(document.querySelector('#return-menu-link'));
                const menuTarget = document.elementFromPoint(menuLink.x + menuLink.width / 2, menuLink.y + menuLink.height / 2);
                return {
                    canvas: rect(document.querySelector('#game')),
                    controls: ['btnDrop','btnLeft','btnRight','btnSwap','btnPause'].map(id=>rect(document.getElementById(id))),
                    text: ['currentName','nextName','goal'].map(id=>({text:document.getElementById(id).textContent, ...rect(document.getElementById(id))})),
                    hudArenaOverlap: intersects(hud, arena),
                    hudControlsOverlap: intersects(hud, controlsBox),
                    menuHudOverlap: intersects(menuLink, hud),
                    menuLinkHeight: menuLink.height,
                    menuLinkHit: menuTarget?.closest('#return-menu-link')?.id,
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            });
            assert.equal(metrics.overflow, false);
            assert.equal(metrics.hudArenaOverlap, false, `${width}x${height}: HUD covers the game board`);
            assert.equal(metrics.hudControlsOverlap, false, `${width}x${height}: HUD covers touch controls`);
            assert.equal(metrics.menuHudOverlap, false, `${width}x${height}: HUD covers the Games Menu link`);
            assert(metrics.menuLinkHeight >= 44 && metrics.menuLinkHit === 'return-menu-link', `${width}x${height}: Games Menu link is not a reachable 44px target`);
            assert(Math.abs(metrics.canvas.width / metrics.canvas.height - 520 / 680) < .01);
            for (const r of metrics.controls) {
                assert(r.width >= 44 && r.height >= 44, `${width}: touch target`);
                assert(r.x >= 0 && r.y >= 0 && r.x+r.width <= width+1 && r.y+r.height <= height+1, `${width}: control offscreen ${JSON.stringify(metrics)}`);
            }
            for (const r of metrics.text) {
                assert(r.text && r.width > 0 && r.height > 0);
                assert(r.x >= 0 && r.x + r.width <= width + 1, `${width}: fruit or goal offscreen`);
            }
            if (width < 900) await page.touchscreen.tap(metrics.canvas.x + metrics.canvas.width / 2, metrics.canvas.y + metrics.canvas.height / 3);
            else await page.mouse.click(metrics.canvas.x + metrics.canvas.width / 2, metrics.canvas.y + metrics.canvas.height / 3);
            assert.equal((await state(page)).dropCount, 1);
            await page.evaluate(() => testGame.frames(100));
            const before = await state(page);
            await page.setViewportSize({ width: height, height: width });
            assert.deepEqual((await state(page)).world, before.world);
            assert.deepEqual((await state(page)).bodies, before.bodies);
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(80);
            await page.evaluate(() => testGame.frames(1, 0));
            await page.evaluate(() => {
                const tip = document.getElementById('toast');
                tip.textContent = 'Drop these two cherries together to grow a grape.';
                tip.classList.add('show');
            });
            const tipPlacement = await page.evaluate(() => {
                const tip = document.getElementById('toast').getBoundingClientRect();
                const board = document.getElementById('game').getBoundingClientRect();
                const overlaps = tip.width > 0 && tip.height > 0 && !(tip.right <= board.left || tip.left >= board.right || tip.bottom <= board.top || tip.top >= board.bottom);
                return { overlaps, inView: tip.top >= -1 && tip.left >= -1 && tip.bottom <= innerHeight + 1 && tip.right <= innerWidth + 1 };
            });
            assert.equal(tipPlacement.overlaps, false, `${width}x${height}: help covers the bowl`);
            assert.equal(tipPlacement.inView, true, `${width}x${height}: help is off screen`);
            await page.screenshot({ path: path.join(artifacts, `game-${width}x${height}.png`) });
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
    await test('Games Menu link stays clear of start, help, scores, pause and game-over dialogs', async () => {
        for (const [width, height] of [[320, 568], [667, 375]]) {
            const { page, context, errors } = await setup({ width, height }, true);
            const assertClear = async stateName => {
                const bounds = await page.evaluate(() => {
                    const rect = el => {
                        const r = el.getBoundingClientRect();
                        return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom };
                    };
                    const intersects = (a,b) => a.width > 0 && a.height > 0
                        && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
                    const link = rect(document.querySelector('#return-menu-link'));
                    const scores = document.querySelector('#hs-modal').style.display === 'flex';
                    const card = rect(document.querySelector(scores ? '#hs-modal .card' : '#modal .card'));
                    const target = document.elementFromPoint(link.x + link.width / 2, link.y + link.height / 2);
                    return { link, card, overlap: intersects(link, card), linkHit: target?.closest('#return-menu-link')?.id };
                });
                assert.equal(bounds.overlap, false, `${width}x${height} ${stateName}: Games Menu link covers dialog ${JSON.stringify(bounds)}`);
                assert(bounds.link.y >= 0 && bounds.link.bottom <= height && bounds.link.height >= 44 && bounds.linkHit === 'return-menu-link',
                    `${width}x${height} ${stateName}: Games Menu link is not reachable ${JSON.stringify(bounds)}`);
                if (width === 667) await page.screenshot({ path: path.join(artifacts, `dialog-${stateName}-${width}x${height}.png`) });
            };

            await assertClear('start');
            await page.locator('#btnHow').click();
            await assertClear('help');
            await page.locator('#btnHow').click();
            await page.locator('#btnScores').click();
            await assertClear('high-scores');
            await page.locator('#fpHsClose').click();
            await page.locator('#btnPlay').click();
            await page.locator('#btnPause').click();
            await assertClear('pause');
            await page.evaluate(() => testGame.end());
            await assertClear('game-over');
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
    await test('Uninstrumented standalone file starts and plays with network offline', async () => {
        const context = await browser.newContext({ offline: true });
        const page = await context.newPage();
        const errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => requests.push(r.url()));
        await page.goto(pathToFileURL(htmlPath).href);
        await page.locator('#btnPlay').click();
        await page.locator('#btnDrop').click();
        await page.waitForTimeout(900);
        const visibleFruit = await page.locator('#game').evaluate(canvas => {
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let opaque = 0;
            for (let i = 3; i < data.length; i += 16) if (data[i] > 128) opaque++;
            return opaque;
        });
        assert(visibleFruit > 400, 'offline drop did not render on the bowl');
        assert(Number.isFinite(Number(await page.locator('#score').innerText())));
        assert.deepEqual(errors, []);
        assert(requests.every(url => url.startsWith('file:') || url.startsWith('data:')));
        await context.close();
    });
    await test('Real RAF rendering, touch play and pause/resume on uninstrumented release', async () => {
        for (const [width, height] of [[390, 844], [1440, 900]]) {
            const { page, context, errors, requests } = await setup({ width, height }, width < 900, false);
            await page.locator('#btnPlay').click();
            const box = await page.locator('#game').boundingBox();
            for (const fraction of [.30, .70, .48, .30, .68]) {
                if (width < 900) await page.touchscreen.tap(box.x + box.width * fraction, box.y + box.height * .3);
                else await page.mouse.click(box.x + box.width * fraction, box.y + box.height * .3);
                await page.waitForTimeout(1200);
            }
            await page.waitForTimeout(2500);
            const pixels = await page.locator('#game').evaluate(canvas => {
                const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let opaque = 0;
                for (let i=3; i<data.length; i+=4) if(data[i]>128) opaque++;
                return opaque;
            });
            assert(pixels > 3000, 'Actual board must contain rendered fruit and rails');
            assert(requests.every(url => url === 'https://fruitpile.test/'));
            await page.screenshot({ path: path.join(artifacts, `live-${width}x${height}.png`) });
            await page.locator('#btnPause').click();
            const scoreBefore = await page.locator('#score').innerText();
            await page.waitForTimeout(1200);
            assert.equal(await page.locator('#score').innerText(), scoreBefore);
            await page.locator('#btnPlay').click();
            assert(await page.locator('#btnDrop').isEnabled());
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
    await test('Keyboard menu focus stays contained; storage failure and damaged scores do not crash', async () => {
        const { page, context, errors } = await setup();
        await page.locator('#btnPlay').focus();
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab');
            assert(await page.evaluate(() => document.getElementById('modal').contains(document.activeElement)));
        }
        await page.evaluate(() => localStorage.setItem('fruitpile.highscores.v2', '{"merge.classic":[null,{"score":"bad","name":"bad"},{"score":1,"name":"<img>"}]}'));
        const list = await page.evaluate(() => testGame.scores());
        assert.equal(list.length, 1);
        assert.equal(list[0].name, '');
        await page.evaluate(() => {
            Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage denied for test'); } });
        });
        assert.equal(await page.evaluate(() => testGame.save(100, 'TEST')), false);
        await page.locator('#btnPlay').click();
        await page.evaluate(() => testGame.stopRaf());
        assert.equal((await state(page)).running, true);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Sound activates from a user gesture and follows pause and resume', async () => {
        const { page, context, errors } = await setup();
        await page.locator('#btnPlay').click();
        await page.waitForFunction(() => window._fpAudio?.ctx?.state === 'running');
        assert.equal(await page.evaluate(() => window._fpAudio.enabled), true);
        await page.locator('#btnPause').click();
        await page.waitForFunction(() => window._fpAudio.ctx.state === 'suspended');
        await page.locator('#btnPlay').click();
        await page.waitForFunction(() => window._fpAudio.ctx.state === 'running');
        await page.locator('#btnDrop').click();
        assert.equal((await state(page)).dropCount, 1);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Game over plays its cue before audio sleeps; the danger alarm is cabinet-only', async () => {
        const { page, context, errors } = await setup();
        await page.locator('#btnPlay').click();
        await page.waitForFunction(() => window._fpAudio?.ctx?.state === 'running');
        const dangerTones = () => page.evaluate(() => {
            const a = window._fpAudio, original = a._tone;
            let n = 0;
            a._cueAt = {};
            a._tone = function (...args) { n++; return original.apply(this, args); };
            try { a.danger(); } finally { a._tone = original; }
            return n;
        });
        assert.equal(await dangerTones(), 0, 'the casual look gets no new danger alarm');
        await page.evaluate(() => testGame.setArcade(true));
        assert.equal(await dangerTones(), 2, 'the cabinet sounds a two-note alarm');
        await page.evaluate(() => testGame.setArcade(false));
        await page.evaluate(() => {
            window.__cues = [];
            for (const name of ['danger', 'gameOver']) {
                const original = window._fpAudio[name].bind(window._fpAudio);
                window._fpAudio[name] = (...args) => { window.__cues.push(name); return original(...args); };
            }
            testGame.stopRaf(); testGame.danger(); testGame.frames(100);
        });
        assert.deepEqual(await page.evaluate(() => window.__cues), ['danger']);
        await page.evaluate(() => testGame.frames(100));
        assert.equal((await state(page)).running, false);
        assert.deepEqual(await page.evaluate(() => window.__cues), ['danger', 'gameOver']);
        assert.equal(await page.evaluate(() => testGame.audioState()), 'running', 'the game-over jingle gets to play');
        await page.waitForFunction(() => window._fpAudio.ctx.state === 'suspended', null, { timeout: 4000 });
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Arcade cabinet: persisted look, separate scores, padded HUD, chain multiplier, and level ramp', async () => {
        const { page, context, errors } = await setup();
        await page.evaluate(() => testGame.begin());
        let s = await state(page);
        assert.equal(s.key, 'merge.classic');
        assert.equal(s.arcadeClass, false);
        await page.evaluate(() => testGame.setScore(1234));
        assert.equal((await state(page)).scoreText, '1234', 'the default look keeps the plain score');
        await page.locator('#btnPause').click();
        await page.locator('#arcadeMode').check();
        await page.reload();
        await page.evaluate(() => testGame.stopRaf());
        assert(await page.locator('#arcadeMode').isChecked());
        assert(await page.locator('#pushStart').isVisible(), 'the start menu shows PUSH START in the cabinet');
        await page.evaluate(() => testGame.begin());
        s = await state(page);
        assert.equal(s.runArcade, true);
        assert.equal(s.arcadeClass, true);
        assert.equal(s.key, 'arcade.classic');
        assert.equal(s.credits, 1);
        assert.equal(s.level, 1);
        await page.evaluate(() => testGame.setScore(1234));
        assert.equal((await state(page)).scoreText, '00001234');
        const merged = await page.evaluate(() => {
            const out = [];
            for (const key of ['strawberry', 'orange', 'apple', 'cherry']) {
                const before = testGame.state().score;
                testGame.mergePair(key);
                out.push({ key, step: testGame.state().chainStep, gain: testGame.state().score - before });
            }
            return out;
        });
        assert.deepEqual(merged.map(m => m.step), [1, 2, 3, 1], 'bigger tiers climb the chain; a smaller tier restarts it');
        const base = await page.evaluate(() => ['orange', 'apple'].map(k => testGame.points(k)));
        assert(merged[2].gain > merged[1].gain * (base[1] / base[0]) * 1.2, `chain multiplier should lift later links ${JSON.stringify(merged)}`);
        await page.evaluate(() => { testGame.begin(); testGame.dropN(20); });
        s = await state(page);
        assert.equal(s.level, 2);
        assert(s.gravity > 0.85, 'the pace ramps with level');
        await page.screenshot({ path: path.join(artifacts, 'arcade-desktop.png') });
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Arcade continue spends the credit, ignores Escape, and End run reaches initials entry', async () => {
        const { page, context, errors } = await setup();
        await page.evaluate(() => { localStorage.setItem('fruitpile.settings.v2', JSON.stringify({ arcade: true })); });
        await page.reload();
        await page.evaluate(() => { testGame.begin(); testGame.setScore(500); testGame.danger(); testGame.frames(200); });
        let s = await state(page);
        assert.equal(s.continueOffered, true);
        assert.equal(s.running, true);
        assert.equal(await page.locator('#modalTitle').textContent(), 'Continue?');
        await page.keyboard.press('Escape');
        assert.equal((await state(page)).credits, 1, 'Escape must not spend the credit');
        await page.locator('#btnPlay').click();
        assert.equal((await state(page)).credits, 1, 'the tap guard ignores a click as the dialog appears');
        await passTapGuard(page);
        await page.locator('#btnPlay').click();
        await page.evaluate(() => testGame.stopRaf());
        s = await state(page);
        assert.equal(s.credits, 0);
        assert.equal(s.continueOffered, false);
        assert.equal(s.paused, false);
        assert.equal(s.score, 500, 'continuing keeps the score');
        assert(s.bodies.every(b => b.y > 300), 'the top of the bowl is cleared');
        await page.evaluate(() => { testGame.danger(); testGame.frames(200); });
        s = await state(page);
        assert.equal(s.running, false, 'no credits left: the run ends');
        assert.equal(await page.locator('#modalTitle').textContent(), 'Game over');
        assert.equal(await page.locator('#fp-hs-name').getAttribute('maxlength'), '3');

        await page.evaluate(() => { testGame.begin(); testGame.setScore(700); testGame.danger(); testGame.frames(200); });
        assert.equal((await state(page)).continueOffered, true);
        await passTapGuard(page);
        await page.locator('#btnNew').click();
        s = await state(page);
        assert.equal(s.running, false);
        assert.equal(s.continueOffered, false);
        assert.equal(await page.locator('#modalTitle').textContent(), 'Game over');
        assert(await page.locator('#fp-hs-name').isVisible());
        await passTapGuard(page);
        await page.locator('#fp-hs-name').fill('abcd');
        await page.locator('#fp-save-name').click();
        assert.equal((await page.evaluate(() => testGame.scores()))[0].name, 'ABC');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Unavailable Web Audio does not interrupt gameplay or re-enable after settings change', async () => {
        const { page, context, errors } = await setup({ width: 1280, height: 800 }, false, true, unavailableAudioProbe);
        await page.locator('#btnPlay').click();
        assert.equal((await state(page)).running, true);
        assert.equal(await page.evaluate(() => window._fpAudio.enabled), false);
        assert.equal(await page.evaluate(() => window._fpAudio.unavailable), true);
        assert.equal(await page.locator('#volSlider').isDisabled(), true);
        assert.equal(await page.locator('#volSlider').getAttribute('aria-label'), 'Sound unavailable');
        assert.equal(await page.locator('#soundLabel').innerText(), 'Sound unavailable');
        assert.match(await page.locator('#toast').innerText(), /Sound unavailable; gameplay is unaffected\./);
        await page.locator('#btnDrop').click();
        assert.equal((await state(page)).dropCount, 1);
        await page.locator('#btnPause').click();
        await page.locator('#volSlider').evaluate(slider => {
            slider.value = '80';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        assert.equal(await page.evaluate(() => window._fpAudio.enabled), false);
        await page.locator('#btnPlay').click();
        assert.equal((await state(page)).running, true);
        await page.waitForTimeout(20);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Partial Web Audio initialization closes its context and disables the sound control', async () => {
        const { page, context, errors } = await setup({ width: 1280, height: 800 }, false, true, partialAudioGraphProbe);
        await page.locator('#btnPlay').click();
        assert.equal(await page.evaluate(() => window.__closedAudioContexts), 1);
        assert.equal(await page.evaluate(() => window._fpAudio.unavailable), true);
        assert.equal(await page.locator('#volSlider').isDisabled(), true);
        assert.equal(await page.locator('#soundLabel').innerText(), 'Sound unavailable');
        assert.match(await page.locator('#toast').innerText(), /Sound unavailable; gameplay is unaffected\./);
        await page.locator('#btnDrop').click();
        assert.equal((await state(page)).dropCount, 1);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Rejected AudioContext resume promises are handled without stopping play', async () => {
        const { page, context, errors } = await setup({ width: 1280, height: 800 }, false, true, rejectedAudioResumeProbe);
        await page.locator('#btnPlay').click();
        await page.locator('#btnPause').click();
        await page.locator('#btnPlay').click();
        await page.waitForTimeout(40);
        assert.equal((await state(page)).running, true);
        assert(await page.evaluate(() => window.__audioResumes > 0));
        await page.locator('#btnDrop').click();
        await page.waitForTimeout(20);
        assert.equal((await state(page)).dropCount, 1);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Touch-only tablet landscape can pause, read help, view scores, restart and aim/drop', async () => {
        const { page, context, errors } = await setup({ width: 1024, height: 768 }, true);
        const touch = await touchPad(context, page);
        const tap = async selector => {
            const point = await centerOf(page, selector);
            await touch('touchStart', point.x, point.y);
            await touch('touchEnd');
            await page.waitForTimeout(20);
        };
        await tap('#btnPlay');
        assert.equal((await state(page)).running, true);
        await tap('#btnPause');
        assert.equal((await state(page)).paused, true);
        assert.equal((await state(page)).dropCount, 0, 'tapping pause must not drop a fruit');
        await tap('#btnHow');
        assert.equal(await page.locator('#modalTitle').innerText(), 'How to play');
        await tap('#btnHow');
        await tap('#btnScores');
        assert.equal(await page.locator('#hs-modal').evaluate(el => el.style.display), 'flex');
        await tap('#fpHsClose');
        await tap('#btnNew');
        await tap('#btnNew');
        assert.equal((await state(page)).running, true);
        await tap('#btnSwap');
        assert.equal((await state(page)).swapUsed, true);

        const game = (await rects(page, ['game'])).game;
        const x1 = game.left + game.width * .3;
        const x2 = game.left + game.width * .7;
        const y = game.top + game.height * .3;
        await touch('touchStart', x1, y);
        await touch('touchMove', x2, y);
        await touch('touchEnd');
        const dropped = await state(page);
        assert.equal(dropped.dropCount, 1);
        assert(Math.abs(dropped.inputX - (x2 - game.left) * 520 / game.width) < 1.5);

        await page.setViewportSize({ width: 768, height: 1024 });
        const portraitPause = await rects(page, ['btnPause']);
        assert(portraitPause.btnPause.bottom <= 1025 && portraitPause.btnPause.top >= 0);
        await page.setViewportSize({ width: 1024, height: 768 });
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Short landscape game-over name entry remains touch-accessible after rotation', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true);
        const touch = await touchPad(context, page);
        const tap = async selector => {
            const point = await centerOf(page, selector);
            await touch('touchStart', point.x, point.y);
            await touch('touchEnd');
            await page.waitForTimeout(20);
        };
        await tap('#btnPlay');
        await page.setViewportSize({ width: 667, height: 375 });
        await page.evaluate(() => { testGame.setScore(100); testGame.end(); });
        assert.equal(await page.locator('#modalTitle').innerText(), 'Bowl full');
        assert(await page.locator('#fp-hs-name').isVisible());
        await passTapGuard(page);

        const saveBox = await page.locator('#fp-save-name').boundingBox();
        if (saveBox.y < 0 || saveBox.y + saveBox.height > 375) {
            const card = await page.locator('#modal .card').boundingBox();
            await touch('touchStart', card.x + card.width / 2, card.y + card.height * .8);
            await touch('touchMove', card.x + card.width / 2, card.y + card.height * .3);
            await touch('touchEnd');
        }
        const visibleSave = await page.locator('#fp-save-name').boundingBox();
        assert(visibleSave.x >= 0 && visibleSave.x + visibleSave.width <= 668 && visibleSave.y >= 0 && visibleSave.y + visibleSave.height <= 376, JSON.stringify(visibleSave));
        await page.locator('#fp-hs-name').fill('TABLET');
        await tap('#fp-save-name');
        assert.equal(await page.locator('#fp-name-saved').isVisible(), true);
        assert.equal((await page.evaluate(() => testGame.scores()))[0].name, 'TABLET');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Touch aims and drops from anywhere on the board; releasing far off the board cancels the drop', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true);
        const touch = await touchPad(context, page);
        await page.evaluate(() => { testGame.begin(); testGame.queue('cherry', 'grape'); });
        const { arena, game } = await rects(page, ['arena', 'game']);
        assert(arena.top < game.top - 12, 'the arena needs spare room above the canvas to test the margin');
        const marginY = (arena.top + game.top) / 2;
        const toDropX = clientX => (clientX - game.left) * 520 / game.width;
        const leftX = game.left + game.width * 0.25;
        const rightX = game.left + game.width * 0.75;
        await touch('touchStart', leftX, marginY);
        const aimedLeft = (await state(page)).inputX;
        assert(Math.abs(aimedLeft - toDropX(leftX)) < 1.5, `aim ${aimedLeft} vs ${toDropX(leftX)}`);
        await touch('touchMove', rightX, marginY);
        const aimedRight = (await state(page)).inputX;
        assert(Math.abs(aimedRight - toDropX(rightX)) < 1.5, `aim ${aimedRight} vs ${toDropX(rightX)}`);
        assert.equal((await state(page)).dropCount, 0, 'aiming alone must not drop');
        await touch('touchEnd');
        const dropped = await state(page);
        assert.equal(dropped.dropCount, 1);
        assert(Math.abs(dropped.bodies[0].x - aimedRight) < 12, `fruit fell at ${dropped.bodies[0].x}, aimed at ${aimedRight}`);
        await page.evaluate(() => testGame.frames(240));
        const farY = arena.bottom + 40;
        assert(farY < 844, 'the off-board release point must stay on screen');
        await touch('touchStart', leftX, marginY);
        await touch('touchMove', leftX, farY);
        await touch('touchEnd');
        assert.equal((await state(page)).dropCount, 1, 'a release well off the board cancels the drop');
        await touch('touchStart', leftX, marginY);
        await touch('touchMove', leftX, arena.bottom + 12);
        await touch('touchEnd');
        assert.equal((await state(page)).dropCount, 2, 'a release just past the edge still drops');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Holding an arrow button glides the aim, a tap nudges once, and opening the menu stops it', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true);
        const touch = await touchPad(context, page);
        await page.evaluate(() => { testGame.begin(); testGame.queue('cherry', 'grape'); testGame.aim(60); });
        const aim = async () => (await state(page)).inputX;
        const holding = selector => page.locator(selector).evaluate(el => el.classList.contains('holding'));
        const right = await centerOf(page, '#btnRight');
        const left = await centerOf(page, '#btnLeft');
        await touch('touchStart', right.x, right.y);
        const nudged = await aim();
        assert(Math.abs(nudged - 84) < 1, `first nudge ${nudged}`);
        assert.equal(await holding('#btnRight'), true);
        await page.waitForFunction(start => testGame.state().inputX > start + 100, nudged, { timeout: 4000 });
        const glided = await aim();
        assert(glided > nudged + 100, `glide ${nudged} -> ${glided}`);
        await touch('touchEnd');
        await page.waitForTimeout(60);
        const stopped = await aim();
        await page.waitForTimeout(300);
        assert.equal(await aim(), stopped, 'aim keeps moving after release');
        assert.equal(await holding('#btnRight'), false);
        await page.evaluate(() => testGame.aim(300));
        await touch('touchStart', left.x, left.y);
        await touch('touchEnd');
        await page.waitForTimeout(450);
        assert(Math.abs(await aim() - 276) < 1, `a tap should move one nudge, got ${await aim()}`);
        await page.evaluate(() => testGame.aim(60));
        await touch('touchStart', right.x, right.y);
        await page.waitForFunction(() => testGame.state().inputX > 120, null, { timeout: 4000 });
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        const atBlur = await aim();
        assert(atBlur > 120, `the glide should have started, got ${atBlur}`);
        await page.waitForTimeout(300);
        assert.equal(await aim(), atBlur, 'the glide must stop when the menu opens');
        assert.equal((await state(page)).paused, true);
        assert.equal(await holding('#btnRight'), false);
        await touch('touchEnd');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Vibration follows its setting, is hidden without touch, and the setting persists', async () => {
        const touchCase = await setup({ width: 390, height: 844 }, true, true, vibrationProbe);
        const { page } = touchCase;
        const vibes = () => page.evaluate(() => window.__vibes);
        const toggle = page.locator('#hapticsToggle');
        await openMoreSettings(page);
        assert(await toggle.isVisible());
        assert(await toggle.isChecked());
        await page.evaluate(() => testGame.begin());
        await page.locator('#btnDrop').click();
        assert.deepEqual(await vibes(), [12]);
        await page.locator('#btnPause').click();
        await toggle.uncheck();
        assert.deepEqual(await vibes(), [12], 'switching vibration off is silent');
        await page.locator('#btnPlay').click();
        await page.evaluate(() => testGame.frames(240));
        await page.locator('#btnDrop').click();
        assert.equal((await state(page)).dropCount, 2);
        assert.deepEqual(await vibes(), [12], 'no vibration while the setting is off');
        await page.reload();
        assert.equal(await page.locator('#hapticsToggle').isChecked(), false);
        await openMoreSettings(page);
        await page.locator('#hapticsToggle').check();
        assert.deepEqual(await vibes(), [8], 'switching it on gives a confirming tick');
        assert.deepEqual(touchCase.errors, []);
        await touchCase.context.close();
        const desktop = await setup({ width: 1280, height: 800 }, false, true, vibrationProbe);
        assert.equal(await desktop.page.locator('#hapticsToggle').isVisible(), false);
        await desktop.page.evaluate(() => testGame.begin());
        await desktop.page.locator('#btnDrop').click();
        assert.deepEqual(await desktop.page.evaluate(() => window.__vibes), []);
        assert.deepEqual(desktop.errors, []);
        await desktop.context.close();
    });
    await test('Android bridge: vibration patterns, capability check, and screen awake only while playing', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true, true, nativeProbe(true));
        const calls = () => page.evaluate(() => window.__native);
        const awake = async () => (await calls()).filter(c => c[0] === 'awake').map(c => c[1]);
        await openMoreSettings(page);
        assert(await page.locator('#hapticsToggle').isVisible());
        await settle(page);
        assert.deepEqual(await awake(), [false], 'the screen may sleep on the menu');
        await page.locator('#btnPlay').click();
        await settle(page);
        await page.locator('#btnPause').click();
        await settle(page);
        await page.locator('#btnPlay').click();
        await settle(page);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await settle(page);
        await page.locator('#btnPlay').click();
        await settle(page);
        await page.evaluate(() => testGame.end());
        await settle(page);
        assert.deepEqual(await awake(), [false, true, false, true, false, true, false], 'play, pause, resume, focus loss, resume, game over');
        await page.evaluate(() => testGame.begin());
        await page.locator('#btnDrop').click();
        await page.evaluate(() => { testGame.begin(); testGame.danger(); testGame.frames(100); });
        await page.evaluate(() => testGame.frames(100));
        assert.deepEqual((await calls()).filter(c => c[0] !== 'awake'), [['vibrate', 12], ['pattern', '25,60,25'], ['pattern', '60,50,120']]);
        assert.deepEqual(errors, []);
        await context.close();
        const off = await setup({ width: 390, height: 844 }, true, true, nativeProbe(false));
        await openMoreSettings(off.page);
        assert.equal(await off.page.locator('#hapticsToggle').isVisible(), false);
        await off.page.evaluate(() => testGame.begin());
        await off.page.locator('#btnDrop').click();
        assert.deepEqual((await off.page.evaluate(() => window.__native)).filter(c => c[0] !== 'awake'), []);
        assert.deepEqual(off.errors, []);
        await off.context.close();
    });
    await test('Android Back closes panels, pauses and resumes a run, and exits only from the menu or game over', async () => {
        const { page, context, errors } = await setup();
        const back = () => page.evaluate(() => window.fruitpileBack());
        assert.equal(await back(), false, 'the start menu lets Back leave the app');
        await page.locator('#btnHow').click();
        assert.equal(await page.locator('#btnHow').innerText(), 'Back to menu');
        assert.equal(await back(), true);
        assert.equal(await page.locator('#btnHow').innerText(), 'How it works');
        assert.equal(await page.locator('#modalTitle').innerText(), 'FruitPile');
        await page.locator('#btnScores').click();
        assert.equal(await page.locator('#hs-modal').evaluate(el => el.style.display), 'flex');
        assert.equal(await back(), true);
        assert.notEqual(await page.locator('#hs-modal').evaluate(el => el.style.display), 'flex');
        await page.evaluate(() => testGame.begin());
        assert.equal(await back(), true, 'Back during a run pauses it');
        assert.equal((await state(page)).paused, true);
        assert.equal(await page.locator('#modalTitle').innerText(), 'Take a breather');
        assert.equal(await back(), true, 'Back on the pause menu resumes');
        assert.equal((await state(page)).paused, false);
        await page.evaluate(() => testGame.end());
        assert.equal(await page.locator('#modalTitle').innerText(), 'Bowl full');
        assert.equal(await back(), false, 'game over lets Back leave the app');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('How it works toggles to Back to menu, restores the menu exactly, and sits beside the title in landscape', async () => {
        for (const [size, touch] of [[{ width: 390, height: 844 }, true], [{ width: 667, height: 375 }, true], [{ width: 1280, height: 800 }, false]]) {
            const { page, context, errors } = await setup(size, touch);
            const label = `${size.width}x${size.height}`;
            const title = await page.locator('#modalTitle').innerText();
            const body = await page.locator('#modalBody').innerText();
            await page.locator('#btnHow').click();
            assert.equal(await page.locator('#btnHow').innerText(), 'Back to menu', label);
            assert.equal(await page.locator('#modalTitle').innerText(), 'How to play', label);
            assert.equal(await page.locator('#menuOptions').isVisible(), false, label);
            const info = await page.locator('#infoBody').innerText();
            assert.match(info, /Controls/, label);
            assert.match(info, /Fruit values/, label);
            assert.match(info, touch ? /Touch: drag anywhere on the board/ : /Keyboard:/, label);
            if (touch) assert.doesNotMatch(info, /Keyboard:/, `${label}: touch screens should not be shown keyboard shortcuts`);
            const r = await rects(page, ['modalTitle', 'infoBody', 'btnHow']);
            const landscapePhone = size.width > size.height && size.width >= 560 && size.height <= 560;
            if (landscapePhone) {
                assert(r.infoBody.left >= r.modalTitle.right - 1, `${label}: the info should sit in its own column ${JSON.stringify(r)}`);
            }
            assert(r.btnHow.bottom <= size.height && r.btnHow.top >= 0, `${label}: Back to menu must stay on screen ${JSON.stringify(r)}`);
            assert(r.infoBody.right <= size.width + 1 && r.infoBody.left >= -1, `${label}: info overflows horizontally`);
            await page.screenshot({ path: path.join(artifacts, `info-${label}.png`) });
            await page.locator('#btnHow').click();
            assert.equal(await page.locator('#btnHow').innerText(), 'How it works', label);
            assert.equal(await page.locator('#modalTitle').innerText(), title, label);
            assert.equal(await page.locator('#modalBody').innerText(), body, label);
            assert.equal(await page.locator('#menuOptions').isVisible(), true, label);
            assert.equal(await page.locator('#infoBody').isVisible(), false, label);
            assert.deepEqual(errors, [], label);
            await context.close();
        }
    });
    await test('Showing a toast never resizes the HUD or the board', async () => {
        for (const [width, height] of [[320, 568], [390, 844], [667, 375], [1280, 800]]) {
            const { page, context, errors } = await setup({ width, height }, width < 900);
            await page.evaluate(() => testGame.begin());
            const ids = ['game', 'arena', 'controls'];
            const before = await rects(page, ids);
            const hudBefore = await page.locator('.hud').boundingBox();
            await page.evaluate(() => {
                const tip = document.getElementById('toast');
                tip.textContent = 'Drop these two cherries together to grow a grape. Keep them touching until the fuse runs out.';
                tip.classList.add('show');
            });
            assert.deepEqual(await rects(page, ids), before, `${width}x${height}: the toast moved the board or controls`);
            assert.deepEqual(await page.locator('.hud').boundingBox(), hudBefore, `${width}x${height}: the toast resized the HUD`);
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
    await test('Touch screens get touch hints and gesture protection; mouse screens keep keyboard hints', async () => {
        const displays = page => page.evaluate(() => ({
            touch: [...document.querySelectorAll('.hintTouch')].map(el => getComputedStyle(el).display),
            keys: [...document.querySelectorAll('.hintKeys')].map(el => getComputedStyle(el).display)
        }));
        const phone = await setup({ width: 390, height: 844 }, true);
        assert.deepEqual(await displays(phone.page), { touch: ['block'], keys: ['none'] });
        const doc = await phone.page.evaluate(() => {
            const meta = name => document.querySelector(`meta[name="${name}"]`)?.content;
            const style = id => getComputedStyle(document.getElementById(id));
            const menuSuppressed = id => {
                const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
                document.getElementById(id).dispatchEvent(event);
                return event.defaultPrevented;
            };
            return {
                viewport: meta('viewport'),
                theme: meta('theme-color'),
                overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
                arenaTouch: style('arena').touchAction,
                dropTouch: style('btnDrop').touchAction,
                arrowTouch: style('btnLeft').touchAction,
                arenaMenu: menuSuppressed('arena'),
                controlsMenu: menuSuppressed('controls')
            };
        });
        assert.match(doc.viewport, /width=device-width/);
        assert.match(doc.viewport, /viewport-fit=cover/);
        assert.equal(doc.theme, '#0b1020');
        assert.equal(doc.overscroll, 'none', 'pull-to-refresh must not trigger from the board');
        assert.equal(doc.arenaTouch, 'none');
        assert.equal(doc.dropTouch, 'manipulation', 'no double-tap zoom delay on buttons');
        assert.equal(doc.arrowTouch, 'none');
        assert.equal(doc.arenaMenu, true, 'a long press on the board must not open the context menu');
        assert.equal(doc.controlsMenu, true, 'a long press on the arrows must not open the context menu');
        assert.deepEqual(phone.errors, []);
        await phone.context.close();
        const desktop = await setup({ width: 1280, height: 800 }, false);
        assert.deepEqual(await displays(desktop.page), { touch: ['none'], keys: ['block'] });
        await desktop.context.close();
    });
    await test('The board follows its area when it changes without a window resize', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true);
        await page.evaluate(() => testGame.begin());
        const width = () => page.evaluate(() => parseFloat(document.getElementById('game').style.width));
        const before = await width();
        const world = (await state(page)).world;
        assert(before > 300, `board is ${before}px wide`);
        await page.evaluate(() => { document.getElementById('arena').style.width = '200px'; });
        await page.waitForFunction(() => parseFloat(document.getElementById('game').style.width) < 210);
        assert.deepEqual((await state(page)).world, world, 'the play field is measured in board units, not pixels');
        await page.evaluate(() => { document.getElementById('arena').style.width = ''; });
        await page.waitForFunction(target => Math.abs(parseFloat(document.getElementById('game').style.width) - target) < 1, before);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Phone and tablet layouts keep a large board, a visible Play button and reachable controls', async () => {
        for (const [width, height] of [[360, 800], [412, 915], [568, 320], [915, 412], [800, 1280]]) {
            const label = `${width}x${height}`;
            const { page, context, errors } = await setup({ width, height }, true);
            const inView = r => r.left >= -0.5 && r.top >= -0.5 && r.right <= width + 0.5 && r.bottom <= height + 0.5;
            const menu = await rects(page, ['btnPlay', 'btnHow']);
            const card = await page.locator('#modal .card').boundingBox();
            assert(inView(menu.btnPlay), `${label}: Play is off screen ${JSON.stringify(menu.btnPlay)}`);
            assert(card.x >= -0.5 && card.x + card.width <= width + 0.5, `${label}: the menu card overflows horizontally`);
            await page.screenshot({ path: path.join(artifacts, `menu-${label}.png`) });
            await page.locator('#btnPlay').click();
            await page.evaluate(() => { testGame.stopRaf(); testGame.queue('watermelon', 'watermelon'); });
            const m = await rects(page, ['arena', 'game', 'btnDrop', 'btnLeft', 'btnRight', 'btnSwap', 'btnPause']);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label}: horizontal overflow`);
            assert(Math.abs(m.game.width / m.game.height - 520 / 680) < .01, `${label}: board aspect`);
            assert(m.game.width >= m.arena.width - 2 || m.game.height >= m.arena.height - 2, `${label}: the board leaves room unused ${JSON.stringify(m)}`);
            if (height >= width) assert(m.game.width >= width * 0.9, `${label}: portrait board is only ${Math.round(m.game.width)}px wide`);
            else assert(m.game.height >= height * 0.8, `${label}: landscape board is only ${Math.round(m.game.height)}px tall`);
            for (const id of ['btnDrop', 'btnLeft', 'btnRight', 'btnSwap', 'btnPause']) {
                assert(m[id].width >= 44 && m[id].height >= 44, `${label}: ${id} is ${m[id].width}x${m[id].height}`);
                assert(inView(m[id]), `${label}: ${id} is off screen ${JSON.stringify(m[id])}`);
            }
            await page.screenshot({ path: path.join(artifacts, `game-${label}.png`) });
            assert.deepEqual(errors, []);
            await context.close();
        }
    });
    await test('Android shell matches the package version and exposes every bridge method the game calls', async () => {
        const manifest = fs.readFileSync(new URL('../android/AndroidManifest.xml', import.meta.url), 'utf8');
        const java = fs.readFileSync(new URL('../android/MainActivity.java', import.meta.url), 'utf8');
        assert(manifest.includes(`android:versionName="${version}"`), 'AndroidManifest versionName must equal package.json version');
        assert.match(manifest, /android\.permission\.VIBRATE/);
        assert.match(java, /addJavascriptInterface\(\s*new NativeBridge\(\),\s*"FruitPileNative"\s*\)/);
        const called = [...new Set([...html.matchAll(/\bbridge\.(\w+)\(/g)].map(m => m[1]))].sort();
        assert.deepEqual(called, ['canVibrate', 'keepAwake', 'vibrate', 'vibratePattern']);
        for (const name of called) {
            assert(new RegExp(`@JavascriptInterface\\s+public\\s+\\w+\\s+${name}\\(`).test(java), `MainActivity.java must expose ${name}() with @JavascriptInterface`);
        }
        assert.match(java, /window\.fruitpileBack/);
    });
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
    await browser.close();
}
