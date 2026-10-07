import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const output = path.resolve(process.argv[2] || String.raw`D:\AI_Output\Fruitpile_PC_and_mobile`);
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(output, 'browsers');
const require = createRequire(path.join(output, 'tools', 'package.json'));
const { chromium } = require('playwright');
const htmlPath = path.join(output, 'FruitPile-2.0.1.html');
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
  seedRandom: () => {let s=42;Math.random=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
};
`;
assert.equal((html.match(/            start\(\);/g) || []).length, 1);
const testHtml = html.replace('            start();', `${hook}\n            start();`);
const browser = await chromium.launch({ headless: true });
const results = [];
async function test(name, fn) {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
}
async function setup(size = { width: 1280, height: 800 }, touch = false, instrument = true) {
    const context = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
    const errors = [];
    const requests = [];
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
try {
    await test('Both modes resolve touching fruit, score, and use the documented fuse', async () => {
        const { page, context, errors } = await setup();
        for (const mode of ['explode', 'merge']) {
            await page.evaluate(mode => {
                testGame.begin(mode);
                const ids = testGame.pair();
                const release = mode === 'explode' ? testGame.hold(ids) : null;
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
            await page.evaluate(hz => { testGame.seedRandom(); testGame.begin('merge'); testGame.pair(); testGame.frames(hz * 3, 1000 / hz); }, hz);
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
        await page.evaluate(() => { testGame.begin('explode'); testGame.pair(); testGame.frames(20); });
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
        await page.evaluate(() => { testGame.stopRaf(); testGame.frames(150); });
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
        await page.evaluate(() => { testGame.begin('merge'); testGame.idleFruit(); testGame.frames(200); });
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
        for (let i = 0; i < 6; i++) {
            await page.locator('#btnDrop').click();
            await page.waitForTimeout(400);
        }
        await page.waitForTimeout(2500);
        assert(Number(await page.locator('#score').innerText()) > 0);
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
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
    await browser.close();
}
