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
  state: () => ({running, paused, simTime, score, gameMode, runChaos, settings: {...settings},
    current: currentFruit.key, next: nextFruit.key, dropCount, swapUsed, largestCreated,
    diamondsCreated, bestCombo, comboCount, scoreGoal, inputX: input.x,
    pending: explodeQueue.length + stagedDetonations.length + stagedClusterSweeps.length + mergedClusterSweeps.length,
    bodies: Composite.allBodies(world).filter(isFruitBody).map(b => ({id:b.id,key:b.plugin.fruitKey,x:b.position.x,y:b.position.y,vx:b.velocity.x,vy:b.velocity.y})),
    world: {...playfield}, key: fpHsKey()}),
  begin: mode => { gameMode=mode; updateModeButtons(); newGame(); audio.setVolume(0); cancelAnimationFrame(rafId); lastT=100; },
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
  aim: x => { input.x = x; }
};
`;
assert.equal((html.match(/            start\(\);/g) || []).length, 1);
const testHtml = html.replace('            start();', `${hook}\n            start();`);
const browser = await chromium.launch({ headless: true });
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
try {
    await test('Both modes resolve touching fruit, score, and use the documented fuse', async () => {
        const { page, context, errors } = await setup();
        for (const mode of ['explode', 'merge']) {
            await page.evaluate(mode => {
                testGame.begin(mode);
                const ids = testGame.pair();
                const release = testGame.hold(ids);
                try { testGame.frames(150); } finally { if (release) release(); }
            }, mode);
            const s = await state(page);
            assert(s.score > 0);
            assert.equal(s.bodies.length, mode === 'merge' ? 1 : 0);
            if (mode === 'merge') assert.equal(s.bodies[0].key, 'grape');
            assert.equal(await page.evaluate(() => testGame.fuse(2)), 750);
            assert.equal(await page.evaluate(() => testGame.fuse(4)), 1250);
            const points = await page.evaluate(() => [testGame.points('cherry'), testGame.points('watermelon')]);
            assert(mode === 'merge' ? points[1] > points[0] : points[0] > points[1]);
        }
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Fixed step gives the same simulation at 30, 60 and 120 Hz', async () => {
        const outcomes = [];
        for (const hz of [30, 60, 120]) {
            const { page, context } = await setup();
            await page.evaluate(hz => {
                testGame.seedRandom();
                testGame.begin('merge');
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
        await page.evaluate(() => testGame.begin('explode'));
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
        await page.evaluate(() => { testGame.begin('explode'); const ids = testGame.pair(); window.__releaseHold = testGame.hold(ids); testGame.frames(20); });
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
        await page.locator('#reducedEffects').check();
        await page.locator('#chaosMode').check();
        await page.locator('#btnModeMerge').click();
        await page.reload();
        await page.evaluate(() => testGame.stopRaf());
        assert.equal(await page.locator('#volSlider').inputValue(), '0');
        assert(await page.locator('#reducedEffects').isChecked());
        assert(await page.locator('#chaosMode').isChecked());
        assert.equal((await state(page)).gameMode, 'merge');
        await page.evaluate(() => { testGame.begin('merge'); testGame.idleFruit(); testGame.frames(300); });
        assert.equal((await state(page)).runChaos, true);
        assert.equal((await state(page)).bodies[0].key, 'orange');
        await page.evaluate(() => { testGame.save(1000, 'TEST'); });
        assert.equal((await page.evaluate(() => testGame.scores()))[0].score, 1000);
        await page.locator('#btnPause').click();
        await page.locator('#chaosMode').uncheck();
        await page.evaluate(() => { testGame.begin('merge'); testGame.idleFruit(); testGame.frames(200); });
        assert.equal((await state(page)).bodies[0].key, 'apple');
        assert.equal((await page.evaluate(() => testGame.scores())).length, 0);
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Explosion fuse cancels when fruit separate and watermelon blasts create one diamond', async () => {
        const { page, context, errors } = await setup();
        const result = await page.evaluate(() => {
            testGame.begin('explode');
            const bounced = testGame.pair('cherry');
            const releaseBounce = testGame.hold(bounced);
            try { testGame.frames(20); } finally { releaseBounce(); }
            testGame.separate(bounced[1], 70);
            const before = testGame.state();
            testGame.frames(120);
            const separated = testGame.state();
            const held = testGame.pair('grape');
            const releaseHeld = testGame.hold(held);
            try { testGame.frames(80); } finally { releaseHeld(); }
            const popped = testGame.state();
            testGame.begin('explode');
            const melons = testGame.pair('watermelon', 40);
            const releaseMelons = testGame.hold(melons);
            try { testGame.frames(90); } finally { releaseMelons(); }
            const blasted = testGame.state();
            testGame.frames(45);
            const later = testGame.state();
            return {
                separatedScore: separated.score,
                separatedBodies: separated.bodies.map(b => b.key).sort(),
                armedCancelled: before.pending >= 0,
                grapeScore: popped.score,
                grapesLeft: popped.bodies.filter(b => b.key === 'grape').length,
                blastScore: blasted.score,
                diamonds: blasted.bodies.filter(b => b.key === 'diamond').length,
                melonsLeft: blasted.bodies.filter(b => b.key === 'watermelon').length,
                diamondsLater: later.bodies.filter(b => b.key === 'diamond').length
            };
        });
        assert.equal(result.separatedScore, 0);
        assert.deepEqual(result.separatedBodies, ['cherry', 'cherry']);
        assert(result.grapeScore > 0);
        assert.equal(result.grapesLeft, 0);
        assert.equal(result.diamonds, 1, JSON.stringify(result));
        assert.equal(result.melonsLeft, 0);
        assert.equal(result.diamondsLater, 1);
        assert(result.blastScore < 1000, 'one blast must not be followed by a diamond detonation');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('Merge stays in contact, and a hit moves the fruit fly onto another fruit', async () => {
        const { page, context, errors } = await setup();
        const result = await page.evaluate(() => {
            testGame.begin('merge');
            const bounced = testGame.pair('cherry');
            const releaseBounce = testGame.hold(bounced);
            try { testGame.frames(20); } finally { releaseBounce(); }
            testGame.separate(bounced[1], 70);
            testGame.frames(120);
            const separated = testGame.state().bodies.map(b => b.key).sort();
            testGame.begin('merge');
            const held = testGame.pair('cherry', 20);
            const releaseHeld = testGame.hold(held);
            try { testGame.frames(80); } finally { releaseHeld(); }
            const merged = testGame.state().bodies.map(b => b.key);
            testGame.setChaos(true);
            testGame.begin('explode');
            const planted = testGame.plantFly();
            testGame.scare(planted.apple, planted.grape);
            testGame.freezeFruit();
            const moved = testGame.flies();
            testGame.frames(140);
            const beforeOldDeadline = testGame.flies();
            testGame.frames(180);
            return { separated, merged, moved, beforeOldDeadline, later: testGame.flies() };
        });
        assert.deepEqual(result.separated, ['cherry', 'cherry']);
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
            testGame.begin('explode');
            const masses = testGame.masses();
            const cherryFall = testGame.fall('cherry');
            testGame.begin('explode');
            const melonFall = testGame.fall('watermelon');
            testGame.begin('explode');
            const cherryHit = testGame.strike('cherry');
            testGame.begin('explode');
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
        await page.evaluate(() => { testGame.begin('merge'); testGame.mergePair('watermelon'); });
        assert.equal((await state(page)).diamondsCreated, 1);
        assert.equal((await state(page)).paused, true);
        assert.equal(await page.locator('#modalTitle').innerText(), 'Your first diamond!');
        await page.locator('#btnPlay').click();
        await page.evaluate(() => testGame.stopRaf());
        assert.equal((await state(page)).diamondsCreated, 1);
        await page.evaluate(() => { testGame.begin('explode'); testGame.danger(); testGame.frames(100); });
        assert.equal((await state(page)).running, true);
        assert.match(await page.locator('#danger').innerText(), /Clear the line/);
        await page.evaluate(() => testGame.frames(100));
        assert.equal((await state(page)).running, false);
        assert.equal(await page.locator('#modalTitle').innerText(), 'Bowl full');
        assert.deepEqual(errors, []);
        await context.close();
    });
    await test('320px, portrait, landscape, tablet and desktop retain controls and board geometry', async () => {
        const sizes = [[320, 568], [390, 844], [667, 375], [844, 390], [768, 1024], [1440, 900]];
        for (const [width, height] of sizes) {
            const { page, context, errors } = await setup({ width, height }, width < 900);
            await page.screenshot({ path: path.join(artifacts, `menu-${width}x${height}.png`) });
            await page.locator('#btnPlay').click();
            await page.evaluate(() => { testGame.stopRaf(); testGame.queue('watermelon', 'watermelon'); });
            const metrics = await page.evaluate(() => {
                const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
                return {
                    canvas: rect(document.querySelector('#game')),
                    controls: ['btnDrop','btnLeft','btnRight','btnSwap','btnPause'].map(id=>rect(document.getElementById(id))),
                    text: ['currentName','nextName','goal'].map(id=>({text:document.getElementById(id).textContent, ...rect(document.getElementById(id))})),
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            });
            assert.equal(metrics.overflow, false);
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
                tip.textContent = 'Drop these two cherries together for your first pop.';
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
            await page.locator('#btnModeMerge').click();
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
        await page.evaluate(() => localStorage.setItem('fruitpile.highscores.v2', '{"explode.classic":[null,{"score":"bad","name":"bad"},{"score":1,"name":"<img>"}]}'));
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
    await test('Touch aims and drops from anywhere on the board; releasing far off the board cancels the drop', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true);
        const touch = await touchPad(context, page);
        await page.evaluate(() => { testGame.begin('explode'); testGame.queue('cherry', 'grape'); });
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
        await page.evaluate(() => { testGame.begin('explode'); testGame.queue('cherry', 'grape'); testGame.aim(60); });
        const aim = async () => (await state(page)).inputX;
        const holding = selector => page.locator(selector).evaluate(el => el.classList.contains('holding'));
        const right = await centerOf(page, '#btnRight');
        const left = await centerOf(page, '#btnLeft');
        await touch('touchStart', right.x, right.y);
        const nudged = await aim();
        assert(Math.abs(nudged - 84) < 1, `first nudge ${nudged}`);
        assert.equal(await holding('#btnRight'), true);
        await page.waitForTimeout(1000);
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
        await page.waitForTimeout(600);
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
        assert(await toggle.isVisible());
        assert(await toggle.isChecked());
        await page.evaluate(() => testGame.begin('explode'));
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
        await page.locator('#hapticsToggle').check();
        assert.deepEqual(await vibes(), [8], 'switching it on gives a confirming tick');
        assert.deepEqual(touchCase.errors, []);
        await touchCase.context.close();
        const desktop = await setup({ width: 1280, height: 800 }, false, true, vibrationProbe);
        assert.equal(await desktop.page.locator('#hapticsToggle').isVisible(), false);
        await desktop.page.evaluate(() => testGame.begin('explode'));
        await desktop.page.locator('#btnDrop').click();
        assert.deepEqual(await desktop.page.evaluate(() => window.__vibes), []);
        assert.deepEqual(desktop.errors, []);
        await desktop.context.close();
    });
    await test('Android bridge: vibration patterns, capability check, and screen awake only while playing', async () => {
        const { page, context, errors } = await setup({ width: 390, height: 844 }, true, true, nativeProbe(true));
        const calls = () => page.evaluate(() => window.__native);
        const awake = async () => (await calls()).filter(c => c[0] === 'awake').map(c => c[1]);
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
        await page.evaluate(() => testGame.begin('explode'));
        await page.locator('#btnDrop').click();
        await page.evaluate(() => { testGame.begin('explode'); testGame.danger(); testGame.frames(100); });
        await page.evaluate(() => testGame.frames(100));
        assert.deepEqual((await calls()).filter(c => c[0] !== 'awake'), [['vibrate', 12], ['pattern', '25,60,25'], ['pattern', '60,50,120']]);
        assert.deepEqual(errors, []);
        await context.close();
        const off = await setup({ width: 390, height: 844 }, true, true, nativeProbe(false));
        assert.equal(await off.page.locator('#hapticsToggle').isVisible(), false);
        await off.page.evaluate(() => testGame.begin('explode'));
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
        await page.evaluate(() => testGame.begin('explode'));
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
            await page.evaluate(() => testGame.begin('explode'));
            const ids = ['game', 'arena', 'controls'];
            const before = await rects(page, ids);
            const hudBefore = await page.locator('.hud').boundingBox();
            await page.evaluate(() => {
                const tip = document.getElementById('toast');
                tip.textContent = 'Drop these two cherries together for your first pop. Keep them touching until the fuse runs out.';
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
        await page.evaluate(() => testGame.begin('explode'));
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
