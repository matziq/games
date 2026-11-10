const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const elements = new Map();
const context = new Proxy({}, { get: (target, key) => Object.hasOwn(target,key) ? target[key] : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
function element() {
  return { style: {}, hidden: false, textContent: '', open: false, children: [], getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }), focus() {}, addEventListener() {},
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
check('floating combat and pickup feedback reports actual values without duplicates', () => {
  run("loadFloor(1,63);state='playing';keys.clear();player.x=world.start.x;player.y=world.start.y;player.angle=0;player.cool=0;player.inv=0;player.armor=null;player.hp=100;enemies=[];props=[];loot=[];floatingTexts=[]");
  run("const target=makeEnemy('slime',{x:player.x+34,y:player.y});target.hp=target.max=7;enemies=[target];attack()");
  let texts=sandbox.window.emberkeep.snapshot().floatingTexts;
  assert.equal(texts.length,1);assert.equal(texts[0].text,'-7');assert.equal(texts[0].kind,'strike');
  run("floatingTexts=[];player.cool=0;enemies=[makeEnemy('slime',{x:player.x-34,y:player.y})];attack()");
  assert.equal(sandbox.window.emberkeep.snapshot().floatingTexts.length,0,'a missed attack showed damage');
  run("floatingTexts=[];player.hp=100;player.inv=0;damagePlayer(11)");
  texts=sandbox.window.emberkeep.snapshot().floatingTexts;
  assert.equal(texts.length,1);assert.equal(texts[0].text,'-11');assert.equal(texts[0].kind,'damage');
  run("player.hp=100;player.armor={reduction:.25};player.inv=0;damagePlayer(12)");
  assert.equal(sandbox.window.emberkeep.snapshot().floatingTexts.at(-1).text,'-9','damage label ignored armor');
  const beforeInvulnerable=sandbox.window.emberkeep.snapshot().floatingTexts.length;
  run('player.inv=1;damagePlayer(20)');
  assert.equal(sandbox.window.emberkeep.snapshot().floatingTexts.length,beforeInvulnerable,'invulnerability produced a false hit label');
  run("player.armor=null;player.inv=0;player.gold=0;player.potions=0;player.hp=100;floatingTexts=[];loot=[{x:player.x-12,y:player.y,type:'gold',value:37},{x:player.x+12,y:player.y,type:'potion'}];update(.01)");
  texts=sandbox.window.emberkeep.snapshot().floatingTexts;
  assert.deepEqual(texts.map(f=>f.text).sort(),['+1 HEALING POTION','+37 GOLD'].sort());
  assert.equal(run('player.gold'),37);assert.equal(run('player.potions'),1);
  run('update(.01)');
  assert.equal(sandbox.window.emberkeep.snapshot().floatingTexts.length,2,'a collected item was notified more than once');
  run("loot=[{x:player.x+12,y:player.y,type:'weapon',weapon:{name:'Test Spear',damage:20,range:90,color:'#c6a0ed'}}];interact()");
  assert.ok(sandbox.window.emberkeep.snapshot().floatingTexts.some(f=>f.text==='+ Test Spear'));
  run("loot=[{x:player.x+12,y:player.y,type:'armor',armor:{name:'Test Plate',kind:'plate',color:'#c8cddd',reduction:.3}}];interact()");
  assert.ok(sandbox.window.emberkeep.snapshot().floatingTexts.some(f=>f.text==='+ Test Plate'));
  run("floatingTexts=[];props=[{x:player.x+20,y:player.y,type:'chest',hp:20,open:false}];loot=[];interact()");
  assert.equal(sandbox.window.emberkeep.snapshot().floatingTexts[0].text,'CHEST OPENED');
  run('floatingTexts=[];player.hp=10;player.potions=1;potion()');
  assert.equal(sandbox.window.emberkeep.snapshot().floatingTexts[0].text,'+65 HP');
});
check('ten coherent melee and ranged weapon types drop with valid stats', () => {
  const kinds = new Set();
  for (let i=0;i<200;i++) {
    const w=run('makeWeapon()'); kinds.add(w.kind);
    assert.ok(w.damage>0&&w.range>=68&&w.range<=498&&w.cooldown>=.3&&w.cooldown<=.8);
    run(`heroShots=[];player.weapon=${JSON.stringify(w)};player.cool=0;attack()`);
    assert.equal(run('player.cool'),w.cooldown);
  }
  assert.equal(kinds.size,10);
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
check('idle undead emerge locally, extinguish only their room, then approach and actually damage the knight', () => {
  for(let seed=0;seed<100;seed++){
    run(`loadFloor(1,${seed});state="playing";player.dash=0;player.hp=120;player.inv=0;keys.clear();`);
    const points=run('findIdlePoints()');
    assert.ok(points.length>0,`no local emergence points for seed ${seed}`);
    assert.ok(run('findIdlePoints().every(p=>distance(p,player)>=90&&distance(p,player)<=150&&clearLine(player,p)&&free(p.x,p.y,18))'));
  }
  run('loadFloor(1,42);state="playing";enemies=[];props=[];loot=[];player.hp=120;player.inv=0;player.armor=null;player.boots=null;player.gloves=null;player.helmet=null;player.dash=0;keys.clear();mouse.active=false;');
  const otherTorches=run('world.torches.filter(t=>t.room!==0).map(t=>t.lit)');
  run('for(let i=0;i<301;i++)update(.04)');
  assert.ok(run('enemies.length===2&&enemies.every(e=>e.idleRisen&&distance(e,player)<=150&&e.emerge>0&&e.wind===0)'));
  assert.ok(run('world.torches.filter(t=>t.room===0).every(t=>!t.lit)'),'arrival failed to extinguish the entire room');
  assert.deepEqual(run('world.torches.filter(t=>t.room!==0).map(t=>t.lit)'),otherTorches,'arrival blacked out another room');
  run('for(let i=0;i<34;i++)update(.04)');
  assert.equal(run('player.hp'),120,'emerging zombies dealt unfair immediate damage');
  run('for(let i=0;i<140;i++)update(.04)');
  assert.ok(run('enemies.some(e=>distance(e,player)<55)'),'undead did not approach');
  assert.ok(run('player.hp<120'),'local undead never attacked');
});
check('merchant sanctuary suppresses stillness threats and earthquake timers', () => {
  run('loadFloor(2,42);state="playing";keys.clear();player.dash=0;world.quake.next=.1;for(let i=0;i<1000;i++)update(.04)');
  assert.equal(run('idleThreat.elapsed'),0);
  assert.equal(run('idleThreat.markers.length'),0);
  assert.ok(run('!enemies.some(e=>e.idleRisen)&&world.quake.elapsed===0&&world.cracks.length===0'));
});
check('room identities, graves casks racks webs eggs and ruins preserve floor geometry and safe passages', () => {
  for(let floor=1;floor<=10;floor++){
    run(`loadFloor(${floor},42)`);
    assert.equal(run('new Set(world.rooms.slice(1,11).map(r=>r.kind)).size'),8);
    assert.ok(run('roomKinds.every(kind=>world.rooms.some(r=>r.kind===kind.id&&r.decor.length===6))'));
    assert.ok(run('world.rooms[0].decor.length===0&&world.rooms[11].decor.length===0'));
    assert.ok(run('world.webs.length>=3&&world.webs.every(w=>free(w.x,w.y,18)&&world.rooms.some(r=>r.kind==="spider"&&pointInRoom(w,r)))'));
    const original=sandbox.window.emberkeep.generate(42,Math.ceil(floor/2));
    assert.deepEqual(Array.from(run('world.tiles')),Array.from(original.tiles),'decor modified traversable geometry');
  }
  run('loadFloor(1,42);state="playing";enemies=[];world.traps=[];const web=world.webs[0];player.x=web.x;player.y=web.y;player.dash=0;keys.clear();update(.04)');
  assert.ok(run('player.webbed&&player.slow>0'),'spider webs are only decorative, not a real slowing hazard');
});
check('upright facing mirrors the body while attacks retain their actual aim in every direction', () => {
  for(const [angle,facing] of [[0,1],[Math.PI,-1],[Math.PI/2,1],[-Math.PI/2,1]]){
    assert.equal(run(`heroFacing(${angle})`),facing);
    run(`loadFloor(1,42);state="playing";props=[];enemies=[];player.angle=${angle};player.cool=0;player.dash=0;player.weapon={kind:"sword",damage:16,range:76,cooldown:.36};enemies=[makeEnemy("skeleton",{x:player.x+Math.cos(player.angle)*42,y:player.y+Math.sin(player.angle)*42})];attack()`);
    assert.ok(run('enemies[0].hp<enemies[0].max'),'body mirroring changed the combat aim');
  }
  const body=run('baseDrawActor.toString()').split('if(hero){')[1].split('else if')[0];
  assert.ok(body.indexOf('ctx.scale(heroFacing(player.angle),1)')<body.indexOf('circle(0,-15'));
  assert.ok(body.indexOf('ctx.rotate(player.angle')>body.indexOf('ctx.restore();ctx.save()'),'body is still rotating with aim');
});
check('earthquakes telegraph three seconds, open traversable cracks, and sweep entry down exactly one floor', () => {
  run('loadFloor(3,42);state="playing";enemies=[];props=[];world.traps=[];world.quake.next=.1;updateEarthquakes(.11,player)');
  assert.equal(run('world.quake.warning'),3);
  assert.equal(run('world.cracks.length'),0);
  run('updateEarthquakes(2.99,player)');
  assert.equal(run('world.cracks.length'),0);
  run('updateEarthquakes(.01,player)');
  assert.equal(run('world.cracks.length'),1);
  assert.ok(run('free(world.cracks[0].x,world.cracks[0].y,18)'));
  assert.equal(run('crossesCrack({x:1000,y:1000},{x:1000,y:1000},{x:0,y:0})'),false);
  assert.equal(run('crossesCrack({x:-90,y:-21},{x:-90,y:-21},{x:0,y:0})'),false,'a collinear point outside a crack triggered a fall');
  run('const fissure=world.cracks[0];fissure.grace=0;const prior={x:fissure.x-70,y:fissure.y};player.x=fissure.x+70;player.y=fissure.y;keys.add("d");updateEarthquakes(.04,prior)');
  assert.equal(run('depth'),4,'crack did not descend exactly one floor');
  assert.ok(run('world.merchant&&player.hp===player.max&&keys.size===0&&world.cracks.length===0'));
  assert.equal(run('fallToFloor(11,"invalid")'),false);
  run('loadFloor(9,42);state="playing";world.cracks=[{x:player.x,y:player.y,grace:0}];updateEarthquakes(.04,player)');
  assert.equal(run('depth'),10);
  assert.equal(run('enemies.filter(e=>e.type==="dragon").length'),1);
  run('world.quake.next=.01;updateEarthquakes(200,player)');
  assert.equal(run('depth'),10);assert.equal(run('world.cracks.length'),0);
  assert.ok(run('state==="playing"'),'a crack bypassed the final boss');
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
    assert.ok(sandbox.window.emberkeep.snapshot().floatingTexts.some(f=>f.text.startsWith('PURCHASED ')));
    const armor=run('world.merchant.stock.armor');
    assert.equal(run('buyProduct("armor")'),true);assert.equal(run('world.merchant.stock.armor.quantity'),0);
    assert.ok(run('loot.some(item=>item.type==="armor"&&item.armor.name===world.merchant.stock.armor.item.name)'));
    const potions=run('player.potions'),potionQuantity=run('world.merchant.stock.potion.quantity');
    assert.equal(run('buyProduct("potion")'),true);assert.equal(run('player.potions'),potions+1);
    assert.equal(run('world.merchant.stock.potion.quantity'),potionQuantity-1);
    assert.ok(sandbox.window.emberkeep.snapshot().floatingTexts.some(f=>f.text==='+1 HEALING POTION'));
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
  run("player.x=world.start.x;player.y=world.start.y;player.inv=0;props=[];enemies=[makeEnemy('vine_archer',{x:player.x+220,y:player.y})];enemies[0].cool=0;update(.01)");
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
check('hidden traps reveal only after two stationary adjacent seconds and stay safe', () => {
  run("begin();loadFloor(1,604);enemies=[];props=[];loot=[];player.inv=0;world.traps=[{x:player.x+45,y:player.y,kind:'explosion',inspect:0,active:0,revealed:false,triggered:false}]");
  run('updateTraps(1.9,false)');assert.equal(run('world.traps[0].revealed'),false);
  run('updateTraps(.1,true)');assert.equal(run('world.traps[0].inspect'),0);
  run('updateTraps(1.9,false)');assert.equal(run('world.traps[0].revealed'),false);
  run('updateTraps(.11,false)');assert.equal(run('world.traps[0].revealed'),true);
  const hp=run('player.hp');run('player.x=world.traps[0].x;updateTraps(.04,true)');
  assert.equal(run('player.hp'),hp);assert.equal(run('world.traps[0].triggered'),false);
  run('world.traps[0].revealed=false;world.traps[0].inspect=1.99;updateTraps(.04,false)');
  assert.equal(run('world.traps[0].triggered'),true);assert.equal(run('player.hp'),hp-32);
  run('player.inv=0;updateTraps(.04,false)');assert.equal(run('player.hp'),hp-32);
});
check('poison, fire, explosion, quicksand, bugs and bats have distinct real effects', () => {
  for(const kind of ['poison','fire','explosion','quicksand','bugs','bats']){
    run(`loadFloor(1,604);state='playing';enemies=[];player.inv=0;player.armor=null;player.hp=120;world.traps=[{x:player.x,y:player.y,kind:'${kind}',inspect:0,active:0}];updateTraps(.04,true)`);
    assert.equal(run('world.traps[0].triggered'),true);
    if(kind==='poison'||kind==='fire'){
      const field=kind==='poison'?'poison':'burn';assert.ok(run(`player.${field}>0`));
      const hp=run('player.hp');run('update(1)');assert.ok(run('player.hp')<hp);
    }else if(kind==='explosion')assert.equal(run('player.hp'),88);
    else if(kind==='quicksand'){
      const x=run('player.x');run('move(player,20,0)');assert.equal(run('player.x'),x+7);
      run('updateTraps(6,true)');assert.equal(run('player.slow'),0);
    }else{
      assert.equal(run('enemies.length'),3);assert.equal(run(`enemies.every(e=>e.type==='${kind==='bugs'?'bug':'bat'}'&&e.emerge>0)`),true);
      const hp=run('player.hp');run('enemies[0].x=player.x+20;enemies[0].y=player.y;enemies[0].emerge=0;enemies[0].cool=0;enemies[0].wind=.01;enemies[0].attackAngle=Math.PI;update(.02);update(.04)');
      assert.ok(run('player.hp')<hp,kind+' must attack');
    }
  }
});
check('trapdoors fall two to four floors without bypassing the floor-ten finale', () => {
  for(let floor=1;floor<=8;floor++)for(let seed=0;seed<12;seed++){
    run(`loadFloor(${floor},${seed});state='playing';triggerTrap({x:player.x,y:player.y,kind:'trapdoor'})`);
    assert.ok(run('depth')>=floor+2&&run('depth')<=Math.min(10,floor+4));
    if(run('depth')===10)assert.equal(run("enemies.some(e=>e.type==='dragon')"),true);
  }
  for(let floor=9;floor<=10;floor++){
    run(`loadFloor(${floor},60)`);
    assert.equal(run("world.traps.some(t=>t.kind==='trapdoor')"),false);
  }
});
check('room lighting, reachable torches and hazard placement preserve safe entrances and finale', () => {
  const kinds=new Set();
  for(let floor=1;floor<=10;floor++)for(let seed=0;seed<20;seed++){
    run(`loadFloor(${floor},${seed})`);
    assert.equal(run("world.rooms[0].lighting==='lit'&&world.rooms[11].lighting==='lit'"),true);
    assert.equal(run("world.rooms.some(r=>r.lighting==='dark')&&world.rooms.some(r=>r.lighting==='partial')"),true);
    assert.equal(run('world.torches.every(t=>free(t.x,t.y,12))'),true);
    assert.equal(run('world.traps.every(t=>!pointInRoom(t,world.rooms[0])&&distance(t,world.end)>90&&free(t.x,t.y,12))'),true);
    for(const kind of run('world.traps.map(t=>t.kind)'))kinds.add(kind);
  }
  assert.equal(kinds.size,7);
  run("loadFloor(1,604);enemies=[];props=[];loot=[];const torch=world.torches.find(t=>!t.lit);player.x=torch.x;player.y=torch.y+35;world.end.x=2500;world.end.y=1900");
  const before=run('lightAt({x:torch.x+70,y:torch.y+70})');
  run('interact();update(.01)');assert.equal(run('torch.lit'),true);
  assert.ok(run('lightAt({x:torch.x+70,y:torch.y+70})')>before);
  run('interact()');assert.equal(run('torch.lit'),false);
  run("loot=[{x:player.x,y:player.y,type:'armor',armor:{name:'Priority mail',kind:'chain',reduction:.2}}];interact()");
  assert.equal(run('player.armor.name'),'Priority mail');assert.equal(run('torch.lit'),false);
  run('player.x=world.start.x;player.y=world.start.y;var roomIndex=3;var samplePoint={x:world.torches[roomIndex*4].x+15,y:world.torches[roomIndex*4].y+15};world.torches.filter(t=>t.room===roomIndex).forEach(t=>t.lit=true)');
  const allLit=run('lightAt(samplePoint)');
  run('world.torches.filter(t=>t.room===roomIndex).forEach(t=>t.lit=false)');
  assert.ok(allLit-run('lightAt(samplePoint)')>.5,'extinguishing a previously lit room must darken it');
});
check('ranged projectiles hit monsters and containers, stop at stone, and do not melee at distance', () => {
  for(const kind of ['bow','javelin','boomerang']){
    run(`loadFloor(1,604);enemies=[];props=[];loot=[];world.traps=[];player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',name:'Test',damage:25,color:'#ddd'};player.cool=0;enemies=[makeEnemy('slime',{x:player.x+100,y:player.y})];enemies[0].hp=200;attack()`);
    assert.equal(run('enemies[0].hp'),200);
    for(let i=0;i<30;i++)run('updateHeroShots(.01)');
    assert.equal(run('enemies[0].hp'),173);
    run(`heroShots=[];enemies=[];props=[{x:player.x+70,y:player.y,type:'crate',hp:1,open:false}];player.cool=0;attack()`);
    for(let i=0;i<30;i++)run('updateHeroShots(.01)');
    assert.equal(run('props[0].broken'),true);
    run('heroShots=[];props=[];player.cool=0;enemies=[makeEnemy("slime",{x:player.x+90,y:player.y})];var wallKey=Math.floor(player.y/T)*W+Math.floor((player.x+45)/T);world.tiles[wallKey]=0;attack()');
    const hp=run('enemies[0].hp');
    for(let i=0;i<60;i++)run('updateHeroShots(.01)');
    assert.equal(run('enemies[0].hp'),hp);assert.equal(run('heroShots.length'),0);
  }
});
check('boomerangs turn at the first monster without piercing and return to the knight', () => {
  run("loadFloor(1,604);props=[];loot=[];world.traps=[];enemies=[makeEnemy('slime',{x:player.x+70,y:player.y})];enemies[0].hp=400;player.angle=0;player.weapon={...weaponTypes.boomerang,kind:'boomerang',damage:25,color:'#ddd'};player.cool=0;attack();player.cool=0;attack()");
  assert.equal(run('heroShots.length'),1);
  for(let i=0;i<240;i++)run('updateHeroShots(.01)');
  assert.equal(run('enemies[0].hp'),373);assert.equal(run('heroShots.length'),0);
});
check('all armor slots drop, equip independently, swap deliberately, persist and cap combined defense', () => {
  run('begin();loadFloor(1,604);props=[];loot=[];enemies=[];world.traps=[]');
  for(const slot of ['armor','boots','gloves','helmet']){
    const kinds=new Set();
    for(let i=0;i<300;i++)kinds.add(run('armorSlot(makeArmor())'));
    assert.equal(kinds.size,4);
    run(`loot=[{x:player.x,y:player.y,type:'armor',armor:{...makeArmor('${slot}'),name:'First ${slot}',reduction:.1}}];interact()`);
    assert.equal(run(`player.${slot}.name`),'First '+slot);
  }
  assert.equal(run('reduction()'),.4);
  run("loot=[{x:player.x,y:player.y,type:'armor',armor:{...makeArmor('boots'),name:'New boots',reduction:.12}}];interact()");
  assert.equal(run('player.armor.name'),'First armor');
  assert.equal(run('player.helmet.name'),'First helmet');
  assert.equal(run('loot[0].armor.name'),'First boots');
  run('player.hp=120;player.inv=0;damagePlayer(20)');assert.equal(run('player.hp'),108);
  run('loadFloor(2,604);state="playing";player.gold=2000;openShop()');
  for(const slot of ['armor','boots','gloves','helmet']){
    assert.equal(run(`armorSlot(world.merchant.stock.${slot}.item)`),slot);
    const price=run(`world.merchant.stock.${slot}.price`),gold=run('player.gold');
    assert.equal(run(`buyProduct('${slot}')`),true);
    assert.equal(run('player.gold'),gold-price);
    assert.equal(run(`loot.some(l=>l.type==='armor'&&armorSlot(l.armor)==='${slot}')`),true);
    assert.equal(run(`buyProduct('${slot}')`),false);
  }
  run('closeShop();loadFloor(3,604)');
  assert.equal(run('player.boots.name'),'New boots');
  run('begin()');assert.equal(run('armorSlots.every(slot=>!player[slot])'),true);
});
check('glints fully disappear between shines and require the owning torch, never the player halo', () => {
  run('loadFloor(1,604);enemies=[];world.torches.forEach(t=>t.lit=false);var r=world.rooms[1];var glintTrap={x:(r.x+2)*T,y:(r.y+2)*T};player.x=glintTrap.x;player.y=glintTrap.y');
  assert.ok(run('lightAt(glintTrap)')>.1,'personal navigation halo missing');
  for(let i=0;i<72;i++)assert.equal(run(`trapGlint(glintTrap,${i/20})`),0);
  run('roomTorch(glintTrap).lit=true');
  const values=Array.from({length:72},(_,i)=>run(`trapGlint(glintTrap,${i/20})`));
  assert.ok(values.some(v=>v>.9));assert.ok(values.filter(v=>v===0).length>=50);
  run('roomTorch(glintTrap).lit=false;world.torches.find(t=>t.room===1&&t!==roomTorch(glintTrap)).lit=true');
  assert.equal(run('trapGlint(glintTrap,1)'),0);
});
check('one, two, three and four sconces illuminate exactly proportional quarters of a room', () => {
  run('loadFloor(1,604);enemies=[];player.x=world.start.x;player.y=world.start.y;var lightRoom=world.rooms[1];var sconces=world.torches.filter(t=>t.room===1);sconces.forEach(t=>t.lit=false)');
  for(let n=0;n<=4;n++){
    run(`sconces.forEach((t,i)=>t.lit=i<${n})`);
    const fraction=run(`(()=>{let lit=0;for(let y=0;y<40;y++)for(let x=0;x<40;x++)if(torchIllumination({x:(lightRoom.x+(x+.5)/40*lightRoom.w)*T,y:(lightRoom.y+(y+.5)/40*lightRoom.h)*T})>.2)lit++;return lit/1600})()`);
    assert.equal(fraction,n/4);
  }
});
check('hidden-trap prompts disappear with the glint unless inspection is already underway', () => {
  run("loadFloor(1,604);props=[];loot=[];enemies=[];var hintTrap={x:player.x+45,y:player.y,kind:'fire',inspect:0};world.traps=[hintTrap];roomTorch(hintTrap).lit=true;clock=((.45-hintTrap.x*.013-hintTrap.y*.007)%3.6+3.6)%3.6");
  assert.match(run('interactionPrompt(null)'),/Floor glint/);
  run('clock+=1.5');assert.equal(run('interactionPrompt(null)'),'');
  run('hintTrap.inspect=.8');assert.match(run('interactionPrompt(null)'),/Inspecting floor glint: 40%/);
  run('roomTorch(hintTrap).lit=false');assert.equal(run('interactionPrompt(null)'),'');
});
check('safe traps activate only by deliberate Use, after exactly two seconds, then catch arriving monsters', () => {
  run("loadFloor(1,604);state='playing';enemies=[];props=[];loot=[];world.traps=[{x:player.x+45,y:player.y,kind:'fire',revealed:true,active:0}];player.hp=120;player.inv=0;world.end.x=2500;world.end.y=1900");
  assert.equal(run('nearby().type'),'trap');
  run('player.x=world.traps[0].x;updateTraps(.1,false)');
  assert.equal(run('player.hp'),120);assert.ok(!run('world.traps[0].triggered'));
  run('player.x-=45;interact();updateTraps(1.99,false)');
  assert.ok(!run('world.traps[0].triggered'));assert.ok(run('world.traps[0].arming>0'));
  run('interact();updateTraps(.01,false)');
  assert.equal(run('world.traps[0].triggered'),true);assert.equal(run('world.traps[0].arming'),0);
  assert.equal(run('player.hp'),120,'trap hit a player outside the danger radius');
  run("enemies=[makeEnemy('slime',{x:world.traps[0].x,y:world.traps[0].y})];var victim=enemies[0];updateTraps(.1,false)");
  assert.ok(run('victim.burn>0'));const hp=run('victim.hp');
  run('updateTraps(.5,false)');assert.ok(run('victim.hp')<hp,'monster did not burn over time');
  run('updateTraps(6,false);var oldhp=player.hp;player.x=world.traps[0].x;updateTraps(.1,false)');
  assert.equal(run('player.hp'),run('oldhp'),'spent trap kept damaging entrants');
});
check('all trap types affect monsters; swarms attack nearby monsters and players; falling removes a monster', () => {
  for(const kind of ['poison','fire','explosion','quicksand','trapdoor','bugs','bats']){
    run(`loadFloor(1,604);state='playing';props=[];loot=[];world.traps=[];player.x=world.start.x-100;enemies=[makeEnemy('slime',world.start)];var monster=enemies[0];monster.hp=300;var monsterTrap={...world.start,kind:'${kind}',revealed:true};triggerTrap(monsterTrap,true)`);
    if(kind==='poison')assert.ok(run('monster.poison>0&&monster.hp<300'));
    if(kind==='fire')assert.ok(run('monster.burn>0&&monster.hp<300'));
    if(kind==='explosion')assert.equal(run('monster.hp'),268);
    if(kind==='quicksand'){
      const x=run('monster.x');run('move(monster,20,0)');assert.equal(run('monster.x'),x+7);
    }
    if(kind==='trapdoor'){assert.equal(run('monster.hp'),0);assert.equal(run('depth'),1)}
    if(kind==='bugs'||kind==='bats'){
      run("var swarm=enemies.find(e=>e.trapSwarm);swarm.x=monster.x+20;swarm.y=monster.y;swarm.emerge=0;swarm.cool=0;updateTraps(.01,false)");
      assert.ok(run('monster.hp')<300);
      run('monster.hp=0;player.x=swarm.x-20;player.y=swarm.y;player.hp=120;player.inv=0;swarm.cool=0;updateTraps(.01,false)');
      assert.ok(run('player.hp')<120);
    }
  }
});
check('every projectile stops at the first intact collider even on a killing hit; later shots pass debris', () => {
  for(const kind of ['bow','javelin','knife','throwing_axe','boomerang']){
    for(const prop of ['crate','barrel']){
      run(`loadFloor(1,604);state='playing';world.traps=[];player.level=1;player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:25,color:'#ddd'};props=[{x:player.x+65,y:player.y,type:'${prop}',hp:60,open:false}];enemies=[makeEnemy('slime',{x:player.x+110,y:player.y})];var behind=enemies[0];behind.hp=300;player.cool=0;attack();updateHeroShots(.25)`);
      assert.equal(run('props[0].hp'),33);assert.equal(run('behind.hp'),300);
      run('heroShots=[];props[0].hp=1;player.cool=0;attack();updateHeroShots(.25)');
      assert.equal(run('props[0].broken'),true);assert.equal(run('behind.hp'),300);
      run('heroShots=[];player.cool=0;attack();updateHeroShots(.35)');
      assert.ok(run('behind.hp')<300);
    }
    run(`loadFloor(1,604);state='playing';world.traps=[];props=[];player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:25,color:'#ddd'};enemies=[makeEnemy('slime',{x:player.x+110,y:player.y}),makeEnemy('slime',{x:player.x+60,y:player.y})];enemies[0].hp=300;enemies[1].hp=1;var far=enemies[0];player.cool=0;attack();updateHeroShots(.35)`);
    assert.equal(run('far.hp'),300,'projectile penetrated a killed monster or used array ordering');
  }
  run("loadFloor(1,604);state='playing';enemies=[];world.traps=[];props=[{x:player.x+65,y:player.y,type:'barrel',hp:1,open:false}];player.inv=0;var oldhp=player.hp;shots=[{x:player.x+130,y:player.y,vx:-400,vy:0,life:2,damage:12}];update(.4)");
  assert.equal(run('player.hp'),run('oldhp'));assert.equal(run('props[0].broken'),true);
});
check('returning boomerangs can leave an impact but cannot cross that intact target toward a relocated player', () => {
  for(const type of ['crate','monster']){
    run(`loadFloor(1,604);state='playing';world.traps=[];props=[];enemies=[];player.angle=0;player.weapon={...weaponTypes.boomerang,kind:'boomerang',damage:25,color:'#ddd'};
      var blocker=${type==='crate'?"{x:player.x+80,y:player.y,type:'crate',hp:300,open:false}":"makeEnemy('slime',{x:player.x+80,y:player.y})"};
      blocker.hp=300;${type==='crate'?'props':'enemies'}=[blocker];player.cool=0;attack();updateHeroShots(.2)`);
    assert.equal(run('heroShots[0].returning'),true);
    run('player.x=blocker.x+70;updateHeroShots(.2)');
    assert.equal(run('heroShots.length'),0,'boomerang passed through its still-intact impact target');
    assert.ok(run('blocker.hp>0'));
  }
});
check('repeated floor motifs, tile outlines, and expired overlays are absent but textures, walls, and hazards remain', () => {
  assert.ok(!html.includes("const mark=(x*17+y*31+depth*7)%19"));
  assert.ok(!html.includes("FISSURE: DOWN 1 FLOOR"));
  run("loadFloor(1,604);world.traps=[{x:player.x,y:player.y,kind:'fire',triggered:true,active:0,revealed:true}];heroShots=[]");
  const original = context.fillText, labels = [];
  context.fillText = text => labels.push(text);
  run("drawHazardsAndLighting()");
  assert.equal(labels.includes('SPENT'),false);assert.equal(labels.includes('SAFE'),false);
  run("world.traps[0].active=3;drawHazardsAndLighting()");
  assert.ok(labels.includes('FIRE'));
  context.fillText = original;
  run('world.traps=[];enemies=[];loot=[];floatingTexts=[];heroShots=[]');
  const originalStroke = context.strokeRect, originalImage = context.drawImage, rectangles = [], images = [];
  context.strokeRect = (...args) => rectangles.push(args);
  context.drawImage = (...args) => images.push(args);
  run('render()');
  assert.ok(!rectangles.some(r=>r[2]===38&&r[3]===38),'repeated floor-tile outlines were drawn');
  assert.ok(rectangles.some(r=>r[2]===36&&r[3]===36),'wall edges disappeared');
  assert.ok(images.some(args=>args[0]===run('floorImage')),'supplied floor texture disappeared');
  context.strokeRect = originalStroke;context.drawImage = originalImage;
});
check('exactly overlapping weapon armor and torch cycle individually without attacking or equipping', () => {
  run(`loadFloor(1,604);state='playing';enemies=[];props=[];world.traps=[];world.torches=[];
    var overlap={x:player.x+40,y:player.y}, sword={...overlap,type:'weapon',weapon:makeWeapon()}, mail={...overlap,type:'armor',armor:makeArmor()}, sconce={...overlap,type:'torch',lit:false};
    loot=[sword,mail];world.torches=[sconce];world.seen.fill(1);
    var selectEvent={clientX:(overlap.x-camera.x)/vw*1000,clientY:(overlap.y-camera.y)/vh*700,preventDefault(){}};
    var oldWeapon=player.weapon;var oldCool=player.cool;var oldAngle=player.angle`);
  assert.equal(run("selectWorldPointer(selectEvent)"),true);
  assert.equal(run("selectedWorldItem===sword&&nearby()===sword"),true);
  assert.equal(run("selectionChoices.length"),3);
  run("selectWorldPointer(selectEvent)");assert.equal(run("selectedWorldItem===mail"),true);
  run("selectWorldPointer(selectEvent)");assert.equal(run("selectedWorldItem===sconce"),true);
  assert.equal(run("player.weapon===oldWeapon&&player.cool===oldCool&&player.angle===oldAngle&&!mouse.down&&!sconce.lit"),true);
  run("selectWorldPointer(selectEvent);interact()");
  assert.equal(run("player.weapon===sword.weapon&&!loot.includes(sword)"),true);
  assert.equal(run("selectedWorldItem"),null);
  assert.ok(elements.get('selectionChoices').children.length>=1);
});
check('dedicated torch action ignores overlapping gear, preserves selected item and respects reach and pause', () => {
  run("loadFloor(1,604);state='playing';props=[];world.traps=[];var dedicatedTorch={x:player.x+40,y:player.y,type:'torch',lit:false};world.torches=[dedicatedTorch];loot=[{x:dedicatedTorch.x,y:dedicatedTorch.y,type:'armor',armor:makeArmor()}];selectedWorldItem=loot[0]");
  assert.equal(run("toggleNearbyTorch()"),true);assert.equal(run("dedicatedTorch.lit"),true);
  assert.equal(run("selectedWorldItem===loot[0]"),true);
  run("state='paused'");assert.equal(run("toggleNearbyTorch()"),false);
  run("state='playing';dedicatedTorch.x+=300");assert.equal(run("toggleNearbyTorch()"),false);
  run("dedicatedTorch.x=player.x+40;world.tiles[Math.floor(player.y/T)*W+Math.floor((player.x+20)/T)]=0");
  assert.equal(run("toggleNearbyTorch()"),false);
});
check('delete and one-use undo restore the precise selected overlapping item without duplication', () => {
  run("loadFloor(1,604);state='playing';props=[];world.traps=[];world.torches=[];var a={x:player.x+35,y:player.y,type:'weapon',weapon:makeWeapon()},b={x:player.x+35,y:player.y,type:'armor',armor:makeArmor()};loot=[a,b];selectedWorldItem=b;var equippedBefore=player.weapon");
  assert.equal(run("deleteSelectedGear()"),true);
  assert.equal(run("loot.length===1&&loot[0]===a&&lastGearDelete.item===b&&player.weapon===equippedBefore"),true);
  assert.equal(run("deleteSelectedGear()"),false);
  assert.equal(run("undoGearDelete()"),true);
  assert.equal(run("loot.length===2&&loot.filter(o=>o===b).length===1"),true);
  assert.equal(run("undoGearDelete()"),false);
  run("selectedWorldItem=b;interact()");
  assert.equal(run("player[armorSlot(b.armor)]===b.armor&&!loot.includes(b)"),true);
  assert.equal(run("undoGearDelete()"),false);
});
check('delete protects nongear and pause state; latest undo survives descent but clears on new runs', () => {
  assert.ok(html.includes('Undo last delete restores one item during this run, even after descent.'));
  assert.ok(!html.includes('Undo last delete restores one item on the same floor.'));
  run("loadFloor(1,604);state='playing';var one={x:player.x+40,y:player.y,type:'weapon',weapon:makeWeapon()},two={x:player.x+40,y:player.y,type:'armor',armor:makeArmor()};loot=[one,two];selectedWorldItem=one");
  run("state='paused'");assert.equal(run("deleteSelectedGear()"),false);
  run("state='playing';selectedWorldItem=world.torches[0]");assert.equal(run("deleteSelectedGear()"),false);
  run("selectedWorldItem=one;deleteSelectedGear();selectedWorldItem=two;deleteSelectedGear();undoGearDelete()");
  assert.equal(run("!loot.includes(one)&&loot.includes(two)&&loot.length===1"),true);
  run("selectedWorldItem=two;deleteSelectedGear();loadFloor(2,604)");
  assert.equal(run("lastGearDelete.item===two&&selectedWorldItem===null&&undoGearDelete()"),true);
  assert.equal(run("loot.filter(o=>o===two).length===1&&distance(two,player)===0&&free(two.x,two.y,12)&&!undoGearDelete()"),true);
  for(const descent of ['trapdoor','fissure']){
    run(`loadFloor(3,604);state='playing';var fallingGear={x:player.x+30,y:player.y,type:'weapon',weapon:makeWeapon()};loot=[fallingGear];selectedWorldItem=fallingGear;deleteSelectedGear()`);
    if(descent==='trapdoor')run("var hole={x:player.x,y:player.y,kind:'trapdoor',triggered:false,revealed:false};triggerTrap(hole,player)");
    else run("world.cracks=[{x:player.x,y:player.y,angle:0,length:100,forming:0,grace:0}];updateEarthquakes(.01,player)");
    assert.ok(run("depth>3&&lastGearDelete.item===fallingGear"));
    run("state='paused';undoGearDelete()");
    assert.equal(run("loot.filter(o=>o===fallingGear).length===1&&distance(fallingGear,player)===0&&free(fallingGear.x,fallingGear.y,12)&&!undoGearDelete()"),true,descent);
  }
  run("state='playing';loot=[{x:player.x+30,y:player.y,type:'weapon',weapon:makeWeapon()}];selectedWorldItem=loot[0];deleteSelectedGear();begin()");
  assert.equal(run("lastGearDelete===null&&!undoGearDelete()"),true);
});
check('all room decor breaks once for exactly 1-2 coins only and destroys its own web patch', () => {
  run("loadFloor(9,604);state='playing';loot=[]");
  const kinds = run("JSON.stringify(world.rooms.filter(r=>r.decor.length).map(r=>r.kind))");
  assert.equal(new Set(JSON.parse(kinds)).size,8);
  assert.equal(run("world.rooms.every(r=>r.decor.every(p=>props.includes(p)&&p.type==='decor'&&p.hp>0))"),true);
  run("var furnishings=props.filter(p=>p.type==='decor');furnishings.forEach(p=>{breakProp(p,1000);breakProp(p,1000)})");
  assert.equal(run("loot.length===furnishings.length&&loot.every(l=>l.type==='gold'&&[1,2].includes(l.value))"),true);
  assert.equal(run("world.webs.length"),0);
  assert.equal(run("world.torches.every(t=>!props.includes(t))&&!props.includes(world.end)"),true);
});
check('melee and projectiles shatter decor; projectiles stop on impact then pass rubble', () => {
  for(const kind of ['sword','bow','boomerang']){
    run(`loadFloor(1,604);state='playing';world.traps=[];loot=[];enemies=[];var furnishing={x:player.x+55,y:player.y,type:'decor',label:'Armor stand',hp:1,open:false};props=[furnishing];player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:25,color:'#ddd'};player.cool=0;attack();${kind==='sword'?'':'updateHeroShots(.25);'} `);
    assert.equal(run("furnishing.broken"),true);
    assert.equal(run("loot.length===1&&loot[0].type==='gold'&&[1,2].includes(loot[0].value)"),true);
    run("heroShots=[];player.cool=0;attack()");assert.equal(run("loot.length"),1);
  }
});
check('trap-spawned bugs and bats yield no treasure via melee ranged damage status or direct drops', () => {
  for(const type of ['bug','bat'])for(const path of ['melee','projectile','status','direct']){
    run(`loadFloor(1,604);state='playing';props=[];loot=[];world.traps=[];player.angle=0;player.weapon={...weaponTypes.sword,kind:'sword',damage:25};var swarm=makeEnemy('${type}',{x:player.x+45,y:player.y});swarm.trapSwarm=true;swarm.hp=1;enemies=[swarm];player.cool=0;`);
    if(path==='melee')run("attack()");
    if(path==='projectile')run("player.weapon={...weaponTypes.bow,kind:'bow',damage:25};attack();updateHeroShots(.25)");
    if(path==='status')run("swarm.burn=1;swarm.burnTick=0;swarm.swarmLife=12;updateTraps(.2,false)");
    if(path==='direct')run("hurtEnemy(swarm,1000);drops(swarm,true)");
    assert.equal(run("loot.length"),0,`${type} ${path} rewarded treasure`);
    assert.ok(run("swarm.hp<=0"),`${type} ${path} failed to kill fixture`);
  }
});
console.log(`${count} checks passed.`);
