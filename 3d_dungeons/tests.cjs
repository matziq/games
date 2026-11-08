const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const elements = new Map();
const context = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
function element() {
  return { style: {}, hidden: false, textContent: '', open: false, children: [], getContext: () => context,
    getBoundingClientRect: () => ({ width: 1000, height: 700 }), focus() {}, addEventListener() {},
    append(e) { this.children.push(e); }, prepend(e) { this.children.unshift(e); }, replaceChildren(...e) { this.children = e; },
    setAttribute() {}, insertAdjacentHTML() {}, classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } },
    showModal() { this.open = true; }, close() { this.open = false; } };
}
const sandbox = { console, Uint8Array, Int16Array, Uint32Array, Math, URLSearchParams, structuredClone,
  crypto: webcrypto, location: { search: '?test' }, requestAnimationFrame() {},
  ResizeObserver: class { observe() {} }, Image: class { complete = true; naturalWidth = 120; },
  document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, querySelector: element, addEventListener() {} },
  window: { addEventListener() {} } };
vm.createContext(sandbox);
const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach(script => vm.runInContext(script, sandbox));
const run = code => vm.runInContext(code, sandbox);
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
check('2,500 seeded floors have connected, bounded rooms and exits', () => {
  for (let chapter = 1; chapter <= 5; chapter++) for (let seed = 0; seed < 500; seed++) {
    const w = sandbox.window.emberkeep.generate(seed, chapter);
    const start = Math.floor(w.start.y / 40) * 70 + Math.floor(w.start.x / 40);
    const seen = new Set([start]), queue = [start];
    for (let i = 0; i < queue.length; i++) for (const n of [queue[i] - 1, queue[i] + 1, queue[i] - 70, queue[i] + 70]) {
      if (n >= 0 && n < 70 * 54 && w.tiles[n] && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
    assert.equal(seen.size, w.tiles.reduce((a, b) => a + b, 0), `disconnected seed ${seed}`);
    assert.ok(seen.has(Math.floor(w.end.y / 40) * 70 + Math.floor(w.end.x / 40)));
    assert.equal(w.tiles.slice(0, 70).some(Boolean), false);
    w.rooms.forEach(r => assert.ok(r.x > 0 && r.y > 0 && r.x + r.w < 70 && r.y + r.h < 54));
  }
});
check('generation is deterministic and varied', () => {
  assert.deepEqual(sandbox.window.emberkeep.generate(42, 1).tiles, sandbox.window.emberkeep.generate(42, 1).tiles);
  assert.notDeepEqual(sandbox.window.emberkeep.generate(42, 1).tiles, sandbox.window.emberkeep.generate(43, 1).tiles);
});
check('five chapter themes and monster rosters stay distinct across generated floors', () => {
  run('begin()');
  const api=sandbox.window.emberkeep;
  assert.equal(new Set(api.chapterThemes.map(t=>t.id)).size,5);
  assert.equal(new Set(api.chapterThemes.map(t=>t.floor)).size,5);
  assert.equal(new Set(api.chapterRosters.flat()).size,api.chapterRosters.flat().length);
  assert.equal(api.MAX_FLOOR,10);
  for(let chapter=1;chapter<=5;chapter++){
    const themes=new Set(),rosters=[];
    for(const floor of [chapter*2-1,chapter*2]){
      for(let seed=0;seed<12;seed++){
        const generated=api.generate(seed,chapter);themes.add(generated.theme.id);
        run(`loadFloor(${floor},${seed+100})`);
        const snapshot=api.snapshot(),present=new Set(snapshot.enemyTypes);
        assert.equal(snapshot.realm,chapter);
        for(const type of api.chapterRosters[chapter-1])assert.ok(present.has(type),`missing ${type} on floor ${floor}`);
        if(floor===10)assert.ok(present.has('dragon'));
        else assert.ok(!present.has('dragon'),`dragon appeared before floor 10`);
        for(const type of present)assert.ok(type==='dragon'&&floor===10||api.chapterRosters[chapter-1].includes(type),`wrong creature ${type}`);
        rosters.push([...present].sort().join(','));
      }
    }
    assert.deepEqual([...themes],[api.chapterThemes[chapter-1].id]);
    assert.equal(new Set(rosters).size,chapter===5?2:1);
  }
  assert.equal(new Set(api.chapterRosters.map(r=>r.join(','))).size,5);
  for(const attacks of api.chapterAttacks){
    assert.ok(new Set(attacks).size>=2,'chapter roster needs distinct combat behaviors');
  }
});
run('begin();');
check('sanctuary and stairs are free; movement respects walls', () => {
  assert.equal(run('free(player.x,player.y,12)&&free(world.end.x,world.end.y,12)'), true);
  run('player.x=world.rooms[0].x*T+13;player.y=(world.rooms[0].y+2.5)*T;');
  const x = run('player.x'); run('move(player,-30,0)'); assert.equal(run('player.x'), x);
});
check('attack arc, cooldown, kills, experience and monster loot', () => {
  run("player.x=world.start.x;player.y=world.start.y;player.angle=0;enemies=[makeEnemy('slime',{x:player.x+35,y:player.y}),makeEnemy('slime',{x:player.x-35,y:player.y})];props=[];loot=[];player.cool=0;attack()");
  assert.ok(run('enemies[0].hp<enemies[0].max')); assert.equal(run('enemies[1].hp'), run('enemies[1].max'));
  const hp = run('enemies[0].hp'); run('attack()'); assert.equal(run('enemies[0].hp'), hp);
  run('hurtEnemy(enemies[0],1000)'); assert.equal(run('kills'), 1); assert.ok(run('player.xp>0&&loot.some(l=>l.type==="gold")'));
});
check('walls block attacks and interactions', () => {
  run("loadFloor(1,42);player.angle=0;player.cool=0;player.x=(world.rooms[0].x+2.5)*T;player.y=(world.rooms[0].y+2.5)*T;enemies=[makeEnemy('slime',{x:player.x+60,y:player.y})];props=[{x:player.x+60,y:player.y,type:'chest',open:false}];loot=[];");
  const k = run('Math.floor(player.y/T)*W+Math.floor((player.x+30)/T)');
  run(`world.tiles[${k}]=0;attack();interact()`);
  assert.equal(run('enemies[0].hp'), run('enemies[0].max'));
  assert.equal(run('props[0].open'), false);
  run(`world.tiles[${k}]=1;player.x=world.start.x;player.y=world.start.y;`);
});
check('chests open once; barrels and crates break', () => {
  run("props=[{x:player.x+30,y:player.y,type:'chest',hp:20,open:false}];loot=[];interact()");
  assert.equal(run('props[0].open'), true); assert.ok(run('loot.some(l=>l.type==="weapon")'));
  const length = run('loot.length'); run('loot=[];interact()'); assert.equal(run('props[0].open'), true); assert.ok(length >= 2);
  for (const type of ['barrel', 'crate']) {
    run(`props=[{x:player.x+30,y:player.y,type:'${type}',hp:1,open:false}];player.cool=0;attack()`);
    assert.equal(run('props[0].open'), true);
    assert.equal(run('props[0].broken'), true);
  }
});
check('spider venom, wizard fire and lightning are telegraphed attacks with real effects', () => {
  for (const [type, status] of [['cave_spider','poison'],['cinder_wizard','burn']]) {
    run(`loadFloor(1,42);player.x=world.start.x;player.y=world.start.y;player.hp=120;player.inv=0;player.poison=player.burn=0;shots=[];enemies=[makeEnemy('${type}',{x:player.x+120,y:player.y})];enemies[0].cool=0;update(.01)`);
    assert.ok(run('enemies[0].wind>0'),`${type} has no telegraph`);
    assert.ok(run("enemies[0].attackTarget&&Math.abs(enemies[0].attackTarget.x-player.x)<.01"),`${type} did not lock a target`);
    for(let i=0;i<30;i++)run('update(.04)');
    assert.ok(run(`shots.some(s=>s.type==='${status==='poison'?'venom':'fire'}')`),`${type} did not launch its projectile`);
    run("{const s=shots[0];s.x=player.x;s.y=player.y;s.vx=0;s.vy=0;player.inv=0;update(.01)}");
    assert.ok(run(`player.${status}>0`),`${type} did not apply ${status}`);
  }
  run("loadFloor(5,43);player.x=world.start.x;player.y=world.start.y;player.hp=120;player.inv=0;enemies=[makeEnemy('crypt_wizard',{x:player.x+120,y:player.y})];enemies[0].cool=0;update(.01)");
  assert.ok(run('enemies[0].wind>0'));assert.equal(run('enemies[0].attack'),'lightning');
  const hp=run('player.hp');run('update(1.1)');
  assert.ok(run('player.hp<'+hp),'lightning did not strike the marked target');
  assert.equal(run('chapterRosters[2].includes("crypt_wizard")'),true);
  assert.equal(run('chapterRosters[4].includes("cinder_wizard")'),true);
});
check('weapon exchange, gold pickup and healing', () => {
  run("props=[];loot=[{x:player.x,y:player.y,type:'weapon',weapon:{name:'Runed Spear',damage:50,range:96,color:'#c6a0ed'}}];interact()");
  assert.equal(run('player.weapon.name'), 'Runed Spear'); assert.equal(run('loot[0].weapon.name'), 'Worn Longsword');
  run("loot=[{x:player.x,y:player.y,type:'gold',value:23},{x:player.x,y:player.y,type:'potion'}];enemies=[];update(.01)");
  assert.equal(run('player.gold'), 23); assert.equal(run('player.potions'), 4);
  run('player.hp=30;potion()'); assert.equal(run('player.hp'), 95); assert.equal(run('player.potions'), 3);
});
check('four coherent weapon types have distinct reach and recovery', () => {
  const kinds = new Set();
  for (let i=0;i<200;i++) {
    const w=run('makeWeapon()'); kinds.add(w.kind);
    assert.ok(w.damage>0&&w.range>=68&&w.range<=116&&w.cooldown>=.36&&w.cooldown<=.46);
    run(`player.weapon=${JSON.stringify(w)};player.cool=0;attack()`);
    assert.equal(run('player.cool'),w.cooldown);
  }
  assert.equal(kinds.size,4);
});
check('armor drops from all loot sources, equips, swaps and reduces damage with a cap', () => {
  for (const type of ['slime','barrel','crate','chest']) {
    run('loot=[]');
    for(let i=0;i<150;i++)run(`drops({x:player.x,y:player.y,type:'${type}'},${type==='chest'})`);
    assert.ok(run('loot.some(l=>l.type==="armor")'),type);
  }
  run("props=[];loot=[{x:player.x,y:player.y,type:'armor',armor:{name:'Test Plate',kind:'plate',color:'#c8cddd',reduction:.3}}];interact()");
  assert.equal(run('player.armor.name'),'Test Plate');
  const potions=run('player.potions');run('update(.001)');assert.equal(run('player.potions'),potions);
  run("loot=[{x:player.x,y:player.y,type:'armor',armor:{name:'Test Chain',kind:'chain',color:'#91adb4',reduction:.2}}];interact()");
  assert.equal(run('loot[0].armor.name'),'Test Plate');
  assert.equal(run('loot[0].x===player.x&&loot[0].y===player.y'),true);
  run('player.hp=120;player.inv=0;damagePlayer(20)');assert.equal(run('player.hp'),104);
  run('player.armor.reduction=1;player.inv=0;damagePlayer(20)');assert.equal(run('player.hp'),92);
  run('player.armor=null');
});
check('dodge consumes resolve and grants brief invulnerability', () => {
  run('player.stamina=100;dodge()'); assert.equal(run('player.stamina'), 65);
  const hp = run('player.hp'); run('damagePlayer(20)'); assert.equal(run('player.hp'), hp);
  run('player.inv=0;damagePlayer(20)'); assert.equal(run('player.hp'), hp - 20);
});
check('stillness telegraphs zombie emergence; movement resets the timer, not combat', () => {
  run('loadFloor(1,42);state="playing";enemies=[];props=[];loot=[];keys.clear();player.dash=0;player.x=world.start.x;player.y=world.start.y;');
  run('for(let i=0;i<224;i++)update(.04)');
  assert.equal(sandbox.window.emberkeep.snapshot().idle.markers.length,0);
  run('attack();update(.04)');
  assert.ok(sandbox.window.emberkeep.snapshot().idle.elapsed>8.9,'attacking incorrectly reset stillness');
  run('update(.04)');
  assert.equal(sandbox.window.emberkeep.snapshot().idle.markers.length,2,'warning markers did not appear at nine seconds');
  assert.equal(sandbox.window.emberkeep.snapshot().idle.zombies,0,'zombies spawned before their warning');
  run('keys.add("d");update(.04);keys.clear()');
  assert.ok(sandbox.window.emberkeep.snapshot().idle.elapsed<.05,'movement did not reset the idle clock');
  assert.equal(sandbox.window.emberkeep.snapshot().idle.triggered,false);
  run('for(let i=0;i<301;i++)update(.04)');
  const idle=sandbox.window.emberkeep.snapshot().idle;
  assert.equal(idle.triggered,true);
  assert.equal(idle.zombies,2,'a single idle cycle should spawn two zombies');
  assert.ok(run('enemies.filter(e=>e.type==="zombie").every(e=>e.emerge>0)'),'zombies skipped the emergence animation');
  const x=run('enemies.find(e=>e.type==="zombie").x');
  run('move(enemies.find(e=>e.type==="zombie"),10,0)');
  assert.equal(run('enemies.find(e=>e.type==="zombie").x'),x,'emerging zombies moved before surfacing');
});
check('merchant schedule, safe room and weapon armor potion transactions work on floors 2 and 4', () => {
  for(const floor of [1,3,5,7,9,10]){
    run(`loadFloor(${floor},42)`);
    assert.equal(sandbox.window.emberkeep.snapshot().merchant,null,`unexpected merchant on floor ${floor}`);
  }
  for(const floor of [2,4,6,8])assert.equal(sandbox.window.emberkeep.hasMerchant(floor),true);
  for(const floor of [2,4]){
    run(`loadFloor(${floor},42);state="playing";player.gold=300;player.hp=50;player.weapon={name:"Current Sword"};player.armor=null;`);
    const snapshot=sandbox.window.emberkeep.snapshot();
    assert.ok(snapshot.merchant,'merchant missing from floor '+floor);
    assert.ok(run('props.every(p=>!pointInRoom(p,world.rooms[0],0))'),'trade room contains breakable containers');
    assert.equal(run('openShop()'),true);assert.equal(run('state'),'shop');
    const gold=run('player.gold'),weapon=run('world.merchant.stock.weapon');
    assert.equal(run('buyProduct("weapon")'),true);
    assert.equal(run('player.gold'),gold-weapon.price);
    assert.equal(run('player.weapon.name'),'Current Sword','purchase replaced equipped gear automatically');
    assert.ok(run('loot.some(item=>item.type==="weapon"&&item.weapon.name===world.merchant.stock.weapon.item.name)'));
    const armor=run('world.merchant.stock.armor');
    assert.equal(run('buyProduct("armor")'),true);assert.equal(run('world.merchant.stock.armor.quantity'),0);
    assert.ok(run('loot.some(item=>item.type==="armor"&&item.armor.name===world.merchant.stock.armor.item.name)'));
    const potions=run('player.potions'),potionQuantity=run('world.merchant.stock.potion.quantity');
    assert.equal(run('buyProduct("potion")'),true);assert.equal(run('player.potions'),potions+1);
    assert.equal(run('world.merchant.stock.potion.quantity'),potionQuantity-1);
    run('player.gold=0');
    assert.equal(run('buyProduct("potion")'),false);assert.equal(run('player.gold'),0);
    run('closeShop()');assert.equal(run('state'),'playing');
    run('player.x=world.merchant.x;player.y=world.merchant.y;player.hp=50;player.inv=0;damagePlayer(20)');
    assert.equal(run('player.hp'),50,'the merchant chamber is not safe');
    assert.equal(run('player.gold'),0);
  }
});
check('stairs advance all chapters and restore health', () => {
  run('begin()');
  for (let d = 2; d <= 10; d++) {
    run('player.x=world.end.x;player.y=world.end.y;props=[];loot=[];player.hp=10;interact()');
    assert.equal(run('depth'), d); assert.equal(run('player.hp'), run('player.max'));
    assert.equal(run('world.theme.id'),run(`chapterThemes[${Math.ceil(d/2)-1}].id`));
  }
  assert.equal(run('enemies.filter(e=>e.type==="dragon").length'), 1);
});
check('chapter archer telegraphs and fires; shots collide with walls', () => {
  run("player.x=world.start.x;player.y=world.start.y;player.inv=0;enemies=[makeEnemy('vine_archer',{x:player.x+220,y:player.y})];enemies[0].cool=0;update(.01)");
  assert.ok(run('enemies[0].wind>0')); run('update(.9)'); assert.ok(run('shots.length>0'));
  run("shots=[{x:5,y:5,vx:0,vy:0,life:3,damage:8}];update(.01)"); assert.equal(run('shots.length'), 0);
});
check('dragon alternates telegraphed cone and radial attacks', () => {
  run("enemies=[makeEnemy('dragon',{x:world.end.x,y:world.end.y})];player.x=world.end.x-100;player.y=world.end.y;enemies[0].cool=0;shots=[];update(.01)");
  assert.ok(run('enemies[0].wind>1')); run('player.inv=10;for(let i=0;i<29;i++)update(.04)'); assert.ok(run('shots.length>=10')); assert.equal(run('enemies[0].phase'), 1);
  run('shots=[];enemies[0].cool=0;update(.01);for(let i=0;i<29;i++)update(.04)'); assert.equal(run('shots.length'), 12); assert.equal(run('enemies[0].phase'), 2);
});
check('boss victory, death, restart and pause transitions', () => {
  run('hurtEnemy(enemies[0],10000)'); assert.equal(run('state'), 'won'); assert.ok(run('player.gold>=500'));
  run('begin();player.inv=0;damagePlayer(10000)'); assert.equal(run('state'), 'dead');
  run('begin();togglePause()'); assert.equal(run('state'), 'paused'); run('togglePause()'); assert.equal(run('state'), 'playing');
});
check('embedded source-art inventory contains 15 actual images', () => {
  assert.equal(sandbox.window.SOURCE_ART.length, 15);
  assert.ok(sandbox.window.SOURCE_ART.every(s => s.startsWith('data:image/jpeg;base64,')));
  assert.ok(sandbox.window.FLOOR_ART.startsWith('data:image/jpeg;base64,'));
});
check('gameplay routes sound events without requiring browser audio support', () => {
  const events = sandbox.window.DungeonAudio.diagnostic().events;
  for (const event of ['strike', 'hit', 'barrel', 'crate', 'armor', 'voice', 'chest', 'equip', 'gold', 'heal', 'dodge',
    'damage', 'magic', 'warning', 'dragon', 'victory', 'death', 'floor', 'spellCharge', 'venom', 'lightning', 'fire', 'poison']) {
    assert.ok(events[event] > 0, `missing audio route: ${event}`);
  }
  assert.equal(sandbox.window.DungeonAudio.diagnostic().state, 'locked');
});
console.log(`${count} checks passed.`);
