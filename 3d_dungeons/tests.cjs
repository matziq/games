const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const elements = new Map();
const context = new Proxy({createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)}}}, { get: (target, key) => Object.hasOwn(target,key) ? target[key] : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
function element() {
  return { style: {}, hidden: false, textContent: '', open: false, children: [], getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }), focus() {}, addEventListener() {},
    append(...e) { this.children.push(...e); }, before() {}, prepend(e) { this.children.unshift(e); }, replaceChildren(...e) { this.children = e; },
    attributes:{}, setAttribute(name,value) { this.attributes[name]=String(value); }, getAttribute(name) { return this.attributes[name]??null; },
    removeAttribute(name) { delete this.attributes[name]; }, insertAdjacentHTML() {}, querySelector() { return element(); }, querySelectorAll() { return []; }, dataset:{},
    classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } },
    showModal() { this.open = true; }, close() { this.open = false; } };
}
const sandbox = { console, Uint8Array, Int16Array, Uint32Array, Math, URLSearchParams, structuredClone,
  crypto: webcrypto, location: { search: '?test' }, requestAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
  ResizeObserver: class { observe() {} }, Image: class { complete = true; naturalWidth = 120; },
  document: { body: element(), getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, querySelector: element, addEventListener() {} },
  window: { addEventListener() {}, localStorage: {
    data: new Map(), getItem(key) { return this.data.get(key) ?? null; },
    setItem(key, value) { this.data.set(key, String(value)); }, removeItem(key) { this.data.delete(key); }
  } } };
vm.createContext(sandbox);
const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach(script => vm.runInContext(script, sandbox));
const run = code => vm.runInContext(code, sandbox);
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
check('food drops from crates and barrels, boosts armor, and persists and expires in active time', () => {
  for(const kind of ['crate','barrel']){
    const foods=new Set();
    for(let i=0;i<80;i++){
      run(`begin();setSeed(${i});loot=[];var container={x:player.x+40,y:player.y,type:'${kind}',hp:1,open:false};breakProp(container,99)`);
      for(const item of run("loot.filter(x=>x.type==='food')"))foods.add(item.food);
    }
    assert.deepEqual([...foods].sort(),['fruit','meat','pie']);
  }
  run("begin();world.tiles.fill(1);world.merchant=null;world.traps=[];enemies=[];props=[];player.armor={kind:'plate',reduction:.4};loot=[{x:player.x,y:player.y,type:'food',food:'pie'}];floatingTexts=[];update(.01)");
  assert.equal(run("player.foodArmorTime===30&&Math.abs(reduction()-.55)<1e-8&&floatingTexts.some(f=>f.color==='#8fdde0')"),true);
  run("update(5);saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("player.foodArmorTime===25&&Math.abs(reduction()-.55)<1e-8"),true);
  run("state='paused';var pausedFood=player.foodArmorTime");
  assert.equal(run('player.foodArmorTime'),run('pausedFood'));
  run("state='playing';update(25);");
  assert.equal(run("player.foodArmorTime===0&&Math.abs(reduction()-.4)<1e-8"),true);
  run("loot=[{x:player.x,y:player.y,type:'food',food:'fruit'}];update(.01);player.foodArmorTime=5;loot=[{x:player.x,y:player.y,type:'food',food:'meat'}];update(.01)");
  assert.equal(run('player.foodArmorTime'),30);
});
check('hard difficulty has extra faster monsters and fewer optional drops without changing easy or medium', () => {
  for(const level of ['easy','medium','hard']){
    run(`difficulty='${level}';begin();loadFloor(1,604);var spawnCount=enemies.length;var speed=makeEnemy('slime',player).speed;var itemCount=0;setSeed(101);for(let i=0;i<300;i++){loot=[];drops({x:0,y:0,type:'crate'});itemCount+=loot.length}`);
    const result={count:run('spawnCount'),speed:run('speed'),items:run('itemCount')};
    if(level==='easy')var easy=result;else if(level==='medium')var normal=result;else var hard=result;
  }
  assert.equal(easy.count,normal.count);assert.equal(easy.speed,normal.speed);assert.equal(easy.items,normal.items);
  assert.ok(hard.count>normal.count&&Math.abs(hard.speed/normal.speed-1.25)<1e-8&&hard.items<normal.items*.75,JSON.stringify({normal,hard}));
  run("difficulty='medium'");
});
check('ammo pickup adds stock without changing regular or special selection', () => {
  for(const selection of ['regular','web']){
    run(`begin();world.tiles.fill(1);player.weapon={...weaponTypes.bow,kind:'bow',damage:20};selectedAmmo='${selection}';player.ammoShared.web=3;player.ammoShared.fire=0;loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'bow',special:'fire',value:5}];updateScrolls(0)`);
    assert.equal(run(`selectedAmmo==='${selection}'&&player.ammoShared.fire===5&&loot.length===0`),true);
  }
  run("selectedAmmo='regular';cycleAmmo()");
  assert.equal(run("selectedAmmo==='fire'"),true,'explicit cycling should select collected ammunition');
});
check('bed bugs cling harmlessly for 10 active seconds and honor trap faction and saves', () => {
  run("begin();world.tiles.fill(1);world.merchant=null;world.torches=[];props=[];loot=[];enemies=[];player.hp=120;player.inv=0;var bugTrap={x:player.x,y:player.y,kind:'bedbugs',revealed:false,active:0};world.traps=[bugTrap];triggerTrap(bugTrap)");
  assert.equal(run("player.hp===120&&player.bedbugs===10&&enemies.length===0&&loot.length===0"),true);
  run("update(4);saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("player.bedbugs===6&&player.hp===120"),true);
  run("loadFloor(2,604);world.merchant=null;enemies=[];props=[];world.traps=[]");
  assert.equal(run("player.bedbugs===6"),true,'bed bugs persist when descending');
  run("state='paused';var pausedTime=player.bedbugs;state='playing'");
  assert.equal(run("player.bedbugs===pausedTime"),true);
  run("update(5.9)");
  assert.ok(run("player.bedbugs>0&&player.hp===120"));
  run("update(.2)");
  assert.equal(run("player.bedbugs===0&&player.hp===120"),true);
  run("begin();world.tiles.fill(1);world.merchant=null;world.torches=[];props=[];loot=[];player.hp=120;var mob=makeEnemy('slime',{x:player.x+40,y:player.y});mob.hp=300;mob.emerge=100;enemies=[mob];var safeTrap={x:mob.x,y:mob.y,kind:'bedbugs',revealed:true,active:0};world.traps=[safeTrap];triggerTrap(safeTrap,true)");
  assert.equal(run("mob.bedbugs===10&&mob.hp===300&&!player.bedbugs&&player.hp===120&&enemies.length===1&&loot.length===0"),true);
  run("saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("enemies[0].bedbugs===10&&enemies[0].hp===300"),true);
  run("begin();world.tiles.fill(1);world.merchant=null;world.torches=[];props=[];player.bedbugs=0;var crossing=makeEnemy('slime',{x:player.x+80,y:player.y});crossing.hp=300;crossing.emerge=100;enemies=[crossing];var armed={x:crossing.x,y:crossing.y,kind:'bedbugs',revealed:true,active:0};world.traps=[armed];updateTraps(.01,false)");
  assert.equal(run("armed.triggered&&crossing.bedbugs===10&&!player.bedbugs&&crossing.hp===300"),true);
});
check('legacy bed bugs retain elapsed time and never exceed the new duration', () => {
  run("begin();enemies=[makeEnemy('slime',{x:player.x+40,y:player.y})];player.bedbugs=26;delete player.bedbugsDuration;enemies[0].bedbugs=19;delete enemies[0].bedbugsDuration;saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("player.bedbugs===6&&enemies[0].bedbugs===0"),true);
  run("saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("player.bedbugs===6"),true,'new save must not be migrated twice');
});
check('bed bugs alone do not reduce movement speed', () => {
  run("begin();world.tiles.fill(1);world.merchant=null;world.traps=[];world.webs=[];enemies=[];props=[];loot=[];keys.clear();keys.add('d');player.dash=0;player.root=0;player.slow=0;var originalX=player.x;player.bedbugs=0;update(.04);var cleanStep=player.x-originalX;player.x=originalX;player.bedbugs=10;player.slow=0;player.root=0;update(.04);var bugStep=player.x-originalX;keys.clear()");
  assert.equal(run('bugStep'),run('cleanStep'));
});
check('magic pickups and purchases use their effect colors while ordinary loot stays unchanged', () => {
  for(const effect of ['fire','poison','explosion','light','lightning','web','charm']){
    run(`begin();player.weapon={...weaponTypes.bow,kind:'bow'};floatingTexts=[];loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'bow',special:'${effect}',value:5}];updateScrolls(0)`);
    assert.equal(run('floatingTexts.at(-1).color'),run(`ammoColors.${effect}`),effect);
  }
  for(const effect of ['fireball','light','poison','lightning']){
    run(`begin();player.weapon={kind:'wand',effect:'light',name:'wand'};floatingTexts=[];loot=[{x:player.x,y:player.y,type:'scroll',scroll:'${effect}'}];updateScrolls(0)`);
    assert.equal(run('floatingTexts.at(-1).color'),run(`scrollTypes.${effect}.color`),effect);
  }
  for(const effect of ['fireball','fire','poison','web','light','lightning']){
    for(const automatic of [false,true]){
      run(`begin();world.tiles.fill(1);floatingTexts=[];gearPreferences.enabled=${automatic};gearPreferences.prefer='magic';var wandLoot={x:player.x,y:player.y,type:'weapon',weapon:{kind:'wand',effect:'${effect}',name:'Test wand',damage:99,range:300,cooldown:.5}};loot=[wandLoot];${automatic?'updateAutoGear(0)':'equipLoot(wandLoot)'}`);
      assert.equal(run('floatingTexts.at(-1).color'),run(`magicPickupColor('wand','${effect}')`),effect);
    }
  }
  run("begin();floatingTexts=[];var normalLoot={x:player.x,y:player.y,type:'weapon',weapon:{...weaponTypes.sword,kind:'sword',name:'Sword'}};loot=[normalLoot];equipLoot(normalLoot)");
  assert.equal(run('floatingTexts.at(-1).color'),undefined);
  for(const kind of ['ammo','scroll','weapon']){
    run(`begin();player.gold=1000;player.weapon=${kind==='ammo'?"{...weaponTypes.bow,kind:'bow'}":"{kind:'wand',effect:'light',name:'wand'}"};world.merchant={x:player.x,y:player.y,stock:{test:{kind:'${kind}',price:1,quantity:1,special:'poison',scroll:'poison',item:{kind:'wand',effect:'poison',name:'Poison wand'}}}};state='shop';floatingTexts=[];buyProduct('test')`);
    assert.equal(run('floatingTexts.at(-1).color'),run("magicPickupColor('"+(kind==='weapon'?'wand':kind)+"','poison')"),kind);
  }
});
check('torch flicker is slow and unchanged by pause', () => {
  run("begin();var flame={x:0,burnoutRemaining:5};clock=0;var phase0=torchIntensity(flame);clock=.1;var phase1=torchIntensity(flame);clock=Math.PI/4;var phasePeak=torchIntensity(flame)");
  assert.ok(Math.abs(run('phase1-phase0'))<.08);
  assert.ok(run('phasePeak-phase0')>.3);
  run("state='paused';var beforeClock=clock;var beforeFlicker=torchIntensity(flame)");
  assert.equal(run('clock===beforeClock&&torchIntensity(flame)===beforeFlicker'),true);
});
check('attacks hit overlapping enemies from the player center, including after resume', () => {
  for(const kind of ['sword','bow','crossbow','knife','javelin','throwing_axe','boomerang','rifle','pistol','wand-fireball','wand-poison','wand-web','wand-lightning','wand-fire','wand-light']){
    const weapon=kind.startsWith('wand-')?{kind:'wand',effect:kind.slice(5),power:2,damage:7,range:300,cooldown:.55,color:'#fff'}:{...run(`weaponTypes.${kind}`),kind,damage:20,range:300,cooldown:.4,color:'#fff'};
    run(`begin();world.tiles.fill(1);world.torches=[];world.merchant=null;world.traps=[];props=[];loot=[];heroShots=[];player.weapon=${JSON.stringify(weapon)};player.angle=0;player.cool=0;var closeEnemy=makeEnemy('slime',{x:player.x-20,y:player.y});closeEnemy.hp=300;closeEnemy.emerge=0;enemies=[closeEnemy];saveRun();savedRun=null;restoreSavedRun();closeEnemy=enemies[0];attack()`);
    const damage=300-run('closeEnemy.hp');
    assert.ok(damage>0,`${kind} missed an overlapping enemy`);
    run('updateHeroShots(.5)');
    assert.equal(run('closeEnemy.hp'),300-damage,`${kind} hit twice`);
  }
});
check('close projectiles respect walls and retain effects after a low-frame-rate update', () => {
  run("begin();world.tiles.fill(1);world.torches=[];world.merchant=null;props=[];heroShots=[];player.x=Math.floor(player.x/T)*T+T-3;player.angle=0;var tx=Math.floor(player.x/T)+1,ty=Math.floor(player.y/T);world.tiles[ty*W+tx]=0;var blocked=makeEnemy('slime',{x:player.x+12,y:player.y});blocked.hp=300;enemies=[blocked];player.weapon={...weaponTypes.bow,kind:'bow',damage:20};player.cool=0;attack();updateHeroShots(.3)");
  assert.equal(run('blocked.hp'),300,'projectile hit an enemy through stone');
  run("world.tiles.fill(1);heroShots=[];player.cool=0;player.ammoShared.web=1;selectedAmmo='web';blocked.x=player.x+23;attack();updateHeroShots(.3)");
  assert.ok(run('blocked.hp<300&&blocked.rooted>0'),'close projectile lost its hit or special effect');
});
check('all flood traps seal every carved exit and generated rooms have attackable doors', () => {
  for(let seed=0;seed<60;seed++){
    run(`begin();loadFloor(1,${seed})`);
    assert.equal(run("world.traps.filter(t=>t.kind==='flood').every(t=>{const r=world.rooms[t.room],doors=roomFloodDoors(r);if(!doors.length)return false;const checks=[];for(let x=r.x;x<r.x+r.w;x++){checks.push([{x:(x+.5)*T,y:r.y*T-.5},{x:(x+.5)*T,y:r.y*T+.5}]);checks.push([{x:(x+.5)*T,y:(r.y+r.h)*T-.5},{x:(x+.5)*T,y:(r.y+r.h)*T+.5}])}for(let y=r.y;y<r.y+r.h;y++){checks.push([{x:r.x*T-.5,y:(y+.5)*T},{x:r.x*T+.5,y:(y+.5)*T}]);checks.push([{x:(r.x+r.w)*T-.5,y:(y+.5)*T},{x:(r.x+r.w)*T+.5,y:(y+.5)*T}])}return checks.every(([a,b])=>!floorAt(a.x,a.y)||!floorAt(b.x,b.y)||doors.some(d=>segmentDoor(a,b,d)!==null))})"),true,`seed ${seed}`);
  }
});
check('flood doors block every exit and starter melee breaks one to drain the room', () => {
  run("begin();loadFloor(1,604);enemies=[];props=[];world.traps=[];var r=world.rooms[1];var t={x:(r.cx+.5)*T,y:(r.cy+.5)*T,room:1,kind:'flood',revealed:false,triggered:false};player.x=t.x;player.y=t.y;world.traps=[t];triggerTrap(t);var door=world.flood.doors[0]");
  assert.equal(run("world.flood.doors.length>0&&world.flood.doors.every(d=>floodBlocked((d.x1+d.x2)/2,(d.y1+d.y2)/2,12,player))"),true);
  run("updateNewHazards(5);var water=world.flood.level;door.hp=90;saveRun();savedRun=null;restoreSavedRun();door=world.flood.doors[0]");
  assert.equal(run("door.hp===90&&world.flood.level===water&&world.flood.room===world.rooms[1]"),true);
  assert.equal(run("fallToFloor(2,'fall')"),false);
  run("var cx=(door.x1+door.x2)/2,cy=(door.y1+door.y2)/2;var horizontal=door.x2-door.x1>door.y2-door.y1;player.x=cx+(horizontal?0:(cx<r.cx*T?35:-35));player.y=cy+(horizontal?(cy<r.cy*T?35:-35):0);player.angle=Math.atan2(cy-player.y,cx-player.x);player.weapon={kind:'sword',name:'Sword',range:82,damage:16,cooldown:.36};player.level=1;for(let i=0;i<5;i++){player.cool=0;attack()}");
  assert.equal(run("world.flood.draining&&!floodBlocked(cx,cy,12,player)"),true);
  run("updateNewHazards(5)");
  assert.equal(run("world.flood"),null);
});
check('flood doors take ranged damage and disarmed flood never harms or blocks the knight', () => {
  run("begin();loadFloor(1,604);props=[];enemies=[];world.traps=[];var r=world.rooms[1];var t={x:(r.cx+.5)*T,y:(r.cy+.5)*T,room:1,kind:'flood',revealed:true,triggered:false};world.traps=[t];player.x=t.x;player.y=t.y;triggerTrap(t,true);var d=world.flood.doors[0],cx=(d.x1+d.x2)/2,cy=(d.y1+d.y2)/2,horizontal=d.x2-d.x1>d.y2-d.y1;player.x=cx+(horizontal?0:(cx<r.cx*T?35:-35));player.y=cy+(horizontal?(cy<r.cy*T?35:-35):0);player.angle=Math.atan2(cy-player.y,cx-player.x);player.weapon={...weaponTypes.bow,kind:'bow',name:'Bow',damage:25,color:'#fff'};heroShots=[];player.cool=0;attack();updateHeroShots(.15)");
  assert.equal(run("d.hp===153&&!floodBlocked(cx,cy,12,player)"),true);
  run("var hp=player.hp;updateNewHazards(8)");
  assert.equal(run("player.hp===hp"),true);
  run("loadFloor(2,604)");
  assert.equal(run("!world.flood"),true);
});
check('new damaging traps and summoned swarms honor player and monster factions', () => {
  for(const [kind,amount] of [['massiveExplosion',70],['lightningTrap',32],['poisonCloud',0]]){
    for(const disarmed of [false,true]){
      run(`begin();loadFloor(1,604);world.tiles.fill(1);world.merchant=null;props=[];player.hp=120;player.inv=0;var t={x:player.x,y:player.y,kind:'${kind}',revealed:${disarmed}};world.traps=[t];var mob=makeEnemy('slime',t);mob.hp=300;enemies=[mob];triggerTrap(t,${disarmed})`);
      assert.equal(run('player.hp'),disarmed?120:120-amount,`${kind} player`);
      assert.equal(run('mob.hp'),disarmed?300-amount:300,`${kind} mob`);
      if(kind==='poisonCloud')assert.equal(run(disarmed?'mob.poison>0&&!player.poison':'player.poison>0&&!mob.poison'),true);
      if(kind==='massiveExplosion')assert.equal(run("world.scrollFlashes.some(f=>f.kind==='fireball'&&f.scale===1.5)"),true);
      if(kind==='lightningTrap')assert.equal(run("world.scrollFlashes.some(f=>f.kind==='lightning')"),true);
    }
  }
  for(const kind of ['spiders','snakes']){
    run(`begin();loadFloor(1,604);world.tiles.fill(1);world.merchant=null;enemies=[];props=[];var t={x:player.x+100,y:player.y,kind:'${kind}',revealed:true};world.traps=[t];triggerTrap(t,true);var brood=enemies.slice();var mob=makeEnemy('slime',{x:brood[0].x+20,y:brood[0].y});mob.hp=300;enemies.push(mob);brood[0].emerge=0;brood[0].cool=0;updateTraps(.01,false)`);
    assert.equal(run(`brood.length===5&&brood.every(e=>e.type==='${kind==='spiders'?'cave_spider':'snake'}'&&e.trapSource===t)&&mob.hp<300`),true);
    run("saveRun();savedRun=null;restoreSavedRun()");
    assert.equal(run("enemies.filter(e=>e.trapSwarm).every(e=>e.trapSource===world.traps[0])"),true);
  }
});
check('poison cloud catches late entrants, expires and persists through save', () => {
  run("begin();loadFloor(1,604);world.tiles.fill(1);world.merchant=null;props=[];enemies=[];var t={x:player.x+120,y:player.y,kind:'poisonCloud',revealed:true,active:0};world.traps=[t];triggerTrap(t,true);saveRun();savedRun=null;restoreSavedRun();var mob=makeEnemy('slime',world.traps[0]);mob.hp=300;enemies=[mob];updateNewHazards(.01)");
  assert.equal(run("mob.poison>0&&world.traps[0].victims.has(mob)"),true);
  run("updateTraps(8,false);var second=makeEnemy('slime',world.traps[0]);enemies=[second];updateNewHazards(.1)");
  assert.equal(run("!second.poison"),true);
});
check('last special round stays special and falls back to regular rather than another stocked type', () => {
  run("begin();world.tiles.fill(1);world.torches=[];enemies=[];props=[];player.weapon={...weaponTypes.bow,kind:'bow',damage:20};player.ammoShared.fire=1;player.ammoShared.web=5;selectedAmmo='fire';player.cool=0;attack()");
  assert.equal(run("heroShots[0].special==='fire'&&selectedAmmo==='regular'&&player.ammoShared.web===5"),true);
  run("player.cool=0;attack()");
  assert.equal(run("heroShots[1].special===null&&selectedAmmo==='regular'"),true);
  run("cycleAmmo()");
  assert.equal(run("selectedAmmo==='web'"),true);
});
check('explosion ammunition produces a smaller fireball and damages nearby enemies', () => {
  run("begin();world.tiles.fill(1);props=[];world.scrollFlashes=[];var victim=makeEnemy('slime',{x:player.x+40,y:player.y});victim.hp=300;enemies=[victim];impactAmmo({x:victim.x,y:victim.y,special:'explosion'},victim)");
  assert.equal(run("victim.hp===265&&world.scrollFlashes.some(f=>f.kind==='fireball'&&f.scale>0&&f.scale<1)"),true);
});
check('E and touch Use manually activate disarmed hazards against monsters and the knight', () => {
  for(const control of ['interact()', "$('touchInteract').onclick()"]){
    run(`begin();world.tiles.fill(1);world.merchant=null;props=[];loot=[];world.end.x=2500;world.end.y=1900;player.hp=120;player.inv=0;var manualTrap={x:player.x+40,y:player.y,kind:'explosion',revealed:true,active:0,triggered:false};world.traps=[manualTrap];var target=makeEnemy('slime',{x:manualTrap.x,y:manualTrap.y});target.hp=300;enemies=[target];selectedWorldItem=null;${control}`);
    assert.equal(run("manualTrap.triggered&&manualTrap.targetFaction==='both'&&target.hp===268&&player.hp===88"),true);
  }
  run("begin();world.tiles.fill(1);props=[];loot=[];world.merchant=null;world.end.x=2500;world.end.y=1900;world.traps=[{x:player.x+40,y:player.y,kind:'fire',revealed:true,active:0,triggered:false}];enemies=[];saveRun();savedRun=null;restoreSavedRun();interact()");
  assert.equal(run("world.traps[0].triggered&&world.traps[0].targetFaction==='both'"),true);
});
check('manual creature traps create allied swarms for ten active seconds with saved lifetimes', () => {
  for(const kind of ['bugs','bats','spiders','snakes']){
    run(`begin();world.tiles.fill(1);world.merchant=null;world.traps=[];props=[];loot=[];enemies=[];player.hp=120;var manualTrap={x:player.x+40,y:player.y,kind:'${kind}',revealed:true,active:0,triggered:false,type:'trap'};world.traps=[manualTrap];selectedWorldItem=manualTrap;interact();var brood=enemies.slice();var foe=makeEnemy('slime',{x:brood[0].x+20,y:brood[0].y});foe.hp=300;foe.emerge=100;enemies.push(foe);for(const member of brood){member.emerge=0;member.cool=0}updateTraps(.1,false)`);
    assert.equal(run("brood.length>0&&brood.every(e=>e.swarmLife===9.9)&&foe.hp<300&&player.hp===120"),true,kind);
    run("saveRun();savedRun=null;restoreSavedRun();brood=enemies.filter(e=>e.trapSource);brood[0].charmed=100;updateTraps(9.8,false)");
    assert.equal(run("brood.every(e=>e.hp>0&&e.swarmLife>0)"),true,kind);
    run("floatingTexts=[];updateTraps(.11,false)");
    assert.equal(run("brood.every(e=>e.hp===0)&&floatingTexts.some(f=>f.text==='POOF!')"),true,kind);
  }
});
check('manual damaging traps affect the knight as well as monsters only in their area', () => {
  for(const kind of ['poison','fire','explosion','quicksand','massiveExplosion','poisonCloud','lightningTrap']){
    run(`begin();world.tiles.fill(1);world.merchant=null;world.traps=[];props=[];loot=[];player.hp=120;player.inv=0;player.poison=player.burn=player.slow=0;var manualTrap={x:player.x+20,y:player.y,kind:'${kind}',revealed:true,triggered:false,type:'trap'};var foe=makeEnemy('slime',{x:manualTrap.x,y:manualTrap.y});foe.hp=300;enemies=[foe];world.traps=[manualTrap];selectedWorldItem=manualTrap;interact()`);
    assert.equal(run("manualTrap.targetFaction==='both'"),true,kind);
    const changed=kind==='poisonCloud'?"player.poison>0&&foe.poison>0":kind==='quicksand'?"player.slow>0&&foe.slow>0":"player.hp<120&&foe.hp<300";
    assert.equal(run(changed),true,kind);
  }
  run("begin();loadFloor(1,604);world.merchant=null;world.tiles.fill(1);props=[];var room=world.rooms[1];player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;player.hp=120;player.inv=0;var foe=makeEnemy('slime',player);foe.hp=300;enemies=[foe];var manualTrap={x:player.x,y:player.y,room:1,kind:'flood',revealed:true};world.traps=[manualTrap];triggerTrap(manualTrap,true,true);updateNewHazards(5)");
  assert.equal(run("world.flood.targetFaction==='both'&&player.hp<120&&foe.hp<300"),true);
});
check('manual and accidental trapdoors descend exactly one floor and preserve the boss gate', () => {
  for(const manual of [false,true]){
    run(`begin();loadFloor(1,604);world.tiles.fill(1);world.merchant=null;world.traps=[];props=[];enemies=[];player.hp=100;var pit={x:player.x+${manual?20:0},y:player.y,kind:'trapdoor',revealed:${manual},type:'trap'};world.traps=[pit];${manual?"selectedWorldItem=pit;interact()":"triggerTrap(pit)"}`);
    assert.equal(run('depth===2&&player.hp>0'),true,String(manual));
  }
  run("begin();loadFloor(8,604);world.tiles.fill(1);world.merchant=null;var pit={x:player.x,y:player.y,kind:'trapdoor',revealed:false};triggerTrap(pit)");
  assert.equal(run('depth===8&&!bossDefeated'),true);
});
check('nearby fragile torches flicker, persist their countdown and relight permanently', () => {
  run("begin();world.tiles.fill(1);enemies=[];props=[];var fragile={x:player.x+40,y:player.y,room:2,lit:true,fragile:true,burnedOut:false,burnoutRemaining:null};world.torches=[fragile];updateTorchBurnout(1)");
  assert.equal(run("fragile.burnoutRemaining===5&&torchIntensity(fragile)<1"),true);
  run("saveRun();savedRun=null;restoreSavedRun();fragile=world.torches[0];updateTorchBurnout(5)");
  assert.equal(run("!fragile.lit&&fragile.burnedOut"),true);
  run("strikeTorch(fragile);updateTorchBurnout(20);saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("world.torches[0].lit&&world.torches[0].burnedOut"),true);
});
check('charmed melee and ranged enemies hurt other monsters temporarily, not the knight', () => {
  for(const attackType of ['melee','ranged']){
    run(`begin();world.tiles.fill(1);world.merchant=null;world.torches=[];world.traps=[];props=[];shots=[];player.inv=0;player.hp=120;var charmer=makeEnemy('slime',{x:player.x+100,y:player.y});var victim=makeEnemy('slime',{x:player.x+130,y:player.y});charmer.attack='${attackType}';charmer.reach=120;charmer.shotSpeed=500;charmer.cool=0;charmer.emerge=0;victim.hp=300;victim.emerge=100;enemies=[charmer,victim];impactAmmo({x:charmer.x,y:charmer.y,special:'charm'},charmer);update(.1);update(.1)`);
    assert.equal(run("victim.hp<300&&player.hp===120"),true,attackType);
    run("charmer.charmed=0;var before=victim.hp;hurtEnemy(victim,20,charmer)");
    assert.equal(run("victim.hp===before"),true);
  }
});
check('merchant stocks varied classes and enforces consumable compatibility', () => {
  run("begin();loadFloor(2,604);player.gold=10000;state='shop';var stock=world.merchant.stock");
  assert.equal(run("stock.melee.item.kind==='sword'&&stock.ranged.item.kind==='bow'&&stock.wand.item.kind==='wand'&&stock.robe.item.kind==='robe'&&ammoKinds.every(k=>stock['ammo-'+k])&&Object.keys(scrollTypes).every(k=>stock['scroll-'+k])"),true);
  assert.equal(run("buyProduct('ammo-fire')"),false);
  assert.equal(run("buyProduct('scroll-light')"),false);
  run("player.weapon={kind:'bow',name:'Bow'}");
  assert.equal(run("buyProduct('ammo-fire')&&player.ammoShared.fire===5"),true);
  run("player.weapon={kind:'wand',name:'Wand',power:2}");
  assert.equal(run("buyProduct('scroll-light')&&player.scrolls.light===1"),true);
  assert.equal(run("buyProduct('wand')&&loot.some(i=>i.type==='weapon'&&i.weapon===stock.wand.item)"),true);
  run("state='playing';saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("world.merchant.stock['ammo-fire'].quantity===1&&world.merchant.stock['scroll-light'].quantity===1"),true);
});
check('accessible game state and essential nonvisual controls initialize', () => {
  run('begin()');
  assert.equal(run("!!document.getElementById('gameEvent')"),true);
  assert.equal(run("!!document.getElementById('gameStateSummary')"),true);
  assert.equal(run("window.emberkeepA11y.readStatus();document.getElementById('gameEvent').textContent.includes('Floor 1')"),true);
  assert.equal(run("Object.values(bindingInputs).length===2&&Object.values(bindingInputs).every(input=>input.id===input.name&&input.type==='text')"),true);
  assert.equal(run("document.getElementById('difficulty').name==='difficulty'&&document.getElementById('volume').name==='volume'"),true);
  assert.equal(run("helpButton.textContent==='How to play'&&guideDialog.getAttribute('aria-labelledby')==='guideTitle'"),true);
  run('begin()');
});
check('all armor slots enforce weapon class on manual and automatic equip', () => {
  for(const [weapon,allowed] of [['sword',['chain','plate']],['bow',['leather','chain']],['rifle',['leather','chain']],['pistol',['leather','chain']],['wand',['robe']]]){
    for(const slot of ['armor','boots','gloves','helmet'])for(const kind of ['leather','chain','plate','robe']){
      run(`begin();world.tiles.fill(1);loot=[];player.weapon={kind:'${weapon}',name:'Test',damage:10,range:300,cooldown:.5};var testArmor={kind:'${kind}',slot:'${slot}',name:'Test ${kind}',reduction:.1};var item={type:'armor',armor:testArmor,x:player.x,y:player.y};loot.push(item)`);
      const expected=allowed.includes(kind);
      assert.equal(run('betterAutoGear(item)'),expected,`${weapon} ${slot} ${kind} automatic`);
      assert.equal(run('equipLoot(item)'),expected,`${weapon} ${slot} ${kind} manual`);
      assert.equal(run(`player.${slot}===testArmor`),expected,`${weapon} ${slot} ${kind} worn`);
      assert.equal(run('loot.includes(item)'),!expected,`${weapon} ${slot} ${kind} floor`);
    }
  }
  run('begin()');
});
check('weapon changes drop only incompatible armor and preserve chain and inventory on resume', () => {
  run("begin();world.tiles.fill(1);loot=[];player.weapon={kind:'sword',name:'Sword',damage:10,range:80,cooldown:.5};player.armor={kind:'plate',slot:'armor',name:'Plate',reduction:.3};player.boots={kind:'chain',slot:'boots',name:'Chain boots',reduction:.1};var bow={type:'weapon',x:player.x,y:player.y,weapon:{kind:'bow',name:'Bow',damage:30,range:400,cooldown:.6}};loot.push(bow);equipLoot(bow)");
  assert.equal(run("!player.armor&&player.boots.name==='Chain boots'&&loot.some(i=>i.armor?.name==='Plate')"),true);
  run("player.gloves={kind:'leather',slot:'gloves',name:'Leather gloves',reduction:.1};var sword={type:'weapon',x:player.x,y:player.y,weapon:{kind:'sword',name:'Sword',damage:40,range:80,cooldown:.5}};loot.push(sword);gearPreferences.enabled=true;gearPreferences.prefer='melee';updateAutoGear(.1)");
  assert.equal(run("player.weapon.kind==='sword'&&!player.gloves&&player.boots.name==='Chain boots'&&loot.some(i=>i.armor?.name==='Leather gloves')"),true);
  run("player.armor={kind:'robe',slot:'armor',name:'Legacy robe',reduction:.2};player.helmet={kind:'leather',slot:'helmet',name:'Legacy leather',reduction:.1};saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("!player.armor&&!player.helmet&&player.boots.name==='Chain boots'&&loot.some(i=>i.armor?.name==='Legacy robe')&&loot.some(i=>i.armor?.name==='Legacy leather')"),true);
  run("saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("loot.filter(i=>i.armor?.name==='Legacy robe').length===1&&loot.filter(i=>i.armor?.name==='Legacy leather').length===1"),true);
  run("gearPreferences.prefer='ranged';begin()");
});
check('weapon classes drop incompatible inventory without losing ammo quantities', () => {
  run("begin();world.tiles.fill(1);loot=[];player.weapon={kind:'bow',name:'Bow',damage:20};player.ammoShared.fire=3;player.ammoShared.web=12;var wandItem={x:player.x,y:player.y,type:'weapon',weapon:{kind:'wand',name:'Wand',power:1,damage:6,range:300,cooldown:.5}};loot.push(wandItem);equipLoot(wandItem);updateScrolls(.1)");
  assert.equal(run("player.ammoShared.fire===0&&player.ammoShared.web===0&&loot.some(i=>i.type==='ammo'&&i.special==='fire'&&i.value===3)&&loot.some(i=>i.type==='ammo'&&i.special==='web'&&i.value===12)"),true);
  run("player.scrolls.fireball=2;var meleeItem={x:player.x,y:player.y,type:'weapon',weapon:{kind:'sword',name:'Sword',damage:20}};loot.push(meleeItem);equipLoot(meleeItem);updateScrolls(.1)");
  assert.equal(run("player.scrolls.fireball===0&&loot.filter(i=>i.type==='scroll'&&i.scroll==='fireball').length===2&&player.ammoShared.web===0"),true);
  run("var bowItem={x:player.x,y:player.y,type:'weapon',weapon:{kind:'bow',name:'Bow',damage:30,range:400,cooldown:.6}};loot.push(bowItem);equipLoot(bowItem);updateScrolls(.01)");
  assert.equal(run("player.ammoShared.fire===3&&player.ammoShared.web===12"),true);
  run("gearPreferences.enabled=true;gearPreferences.prefer='magic';var autoWand={x:player.x,y:player.y,type:'weapon',weapon:{kind:'wand',name:'Wand',power:1,damage:6,range:300,cooldown:.5}};loot.push(autoWand);updateAutoGear(.1)");
  assert.equal(run("isWand(player.weapon)&&player.ammoShared.fire===0&&loot.some(i=>i.type==='ammo'&&i.special==='fire'&&i.value===3)"),true);
  run("gearPreferences.prefer='ranged';begin()");
});
check('legacy bindings and mixed inventories migrate without loss', () => {
  run("begin();player.ammoShared.fire=7;player.scrolls.light=3;var legacy=snapshotRun();legacy.keyBindings={scroll:'t',ammo:'v',potion:'q'};window.localStorage.setItem(RUN_SAVE_KEY,encodeRun(legacy));savedRun=null;restoreSavedRun()");
  assert.equal(run("keyBindings.cycle==='v'&&player.ammoShared.fire===0&&loot.some(i=>i.type==='ammo'&&i.special==='fire'&&i.value===7)&&loot.filter(i=>i.type==='scroll'&&i.scroll==='light').length===3"),true);
  run("legacy=snapshotRun();legacy.keyBindings={scroll:'z',ammo:'v',potion:'q'};window.localStorage.setItem(RUN_SAVE_KEY,encodeRun(legacy));savedRun=null;restoreSavedRun()");
  assert.equal(run("keyBindings.cycle==='z'"),true);
  run("keyBindings.cycle='t';begin()");
});
check('merchant wand purchase drops ammo only when equipped', () => {
  run("begin();loadFloor(2,604);player.weapon={kind:'bow',name:'Bow',damage:20,range:400,cooldown:.6};player.gold=10000;player.ammoShared.fire=7;world.merchant.stock.weapon.item={kind:'wand',effect:'fire',name:'Fire Wand',power:2,damage:7,range:300,cooldown:.5};state='shop';buyProduct('weapon')");
  assert.equal(run("player.ammoShared.fire===7&&!isWand(player.weapon)"),true);
  run("state='playing';var purchased=loot.find(i=>i.type==='weapon'&&i.weapon.kind==='wand');equipLoot(purchased)");
  assert.equal(run("isWand(player.weapon)&&player.ammoShared.fire===0&&loot.some(i=>i.type==='ammo'&&i.special==='fire'&&i.value===7)"),true);
  run('begin()');
});
check('wand poison cloud cap survives saves and reopens after expiry', () => {
  run("begin();world.tiles.fill(1);world.scrollZones=[];var shot={x:player.x,y:player.y,power:2,wandEffect:'poison',color:'#abcdef'};impactWand({...shot},null);impactWand({...shot},null)");
  assert.equal(run('world.scrollZones.filter(z=>z.wandPoison).length'),1);
  run("player.weapon={kind:'wand',effect:'poison',power:2,name:'Poison Wand',damage:7,range:300,cooldown:.55};saveRun();savedRun=null;restoreSavedRun();impactWand({...shot},null)");
  assert.equal(run('world.scrollZones.filter(z=>z.wandPoison).length'),1);
  run("updateScrolls(5.1);impactWand({...shot},null)");
  assert.equal(run('world.scrollZones.filter(z=>z.wandPoison).length'),1);
  run("delete world.scrollZones[0].wandPoison;saveRun();savedRun=null;restoreSavedRun();impactWand({...shot},null)");
  assert.equal(run('world.scrollZones.length'),1);
  run('begin()');
});
check('light and fire cones blind or burn, harm props, and respect walls', () => {
  run("begin();world.tiles.fill(1);world.torches=[];enemies=[];props=[];player.angle=0;var coneEnemy=makeEnemy('slime',{x:player.x+80,y:player.y});coneEnemy.hp=300;enemies=[coneEnemy];var crate={x:player.x+80,y:player.y+22,type:'crate',hp:100,open:false};props=[crate];wandCone('light',3,180,1.2)");
  assert.ok(run("coneEnemy.hp<300&&coneEnemy.blind>0&&coneEnemy.wandDots.light&&crate.hp<100"));
  run("var beforeDot=coneEnemy.hp;updateWandStatuses(.5)");
  assert.ok(run("coneEnemy.hp<beforeDot"));
  run("coneEnemy.blind=0;coneEnemy.wandDots={};coneEnemy.hp=300;crate.hp=100;wandCone('fire',4,180,1.2)");
  assert.ok(run("coneEnemy.wandDots.fire&&crate.hp<100"));
  run("var blockedEnemy=makeEnemy('slime',{x:player.x+120,y:player.y});blockedEnemy.hp=300;enemies=[blockedEnemy];props=[];world.tiles[Math.floor(player.y/T)*W+Math.floor((player.x+60)/T)]=0;wandCone('fire',3,180,1.2)");
  assert.equal(run('blockedEnemy.hp'),300);
  run('begin()');
});
check('web and poison hurt objects over time, fireball has no burn, lightning chains visibly at +5', () => {
  run("begin();world.tiles.fill(1);props=[];enemies=[];var crate={x:player.x+60,y:player.y,type:'crate',hp:100,open:false};props=[crate];impactWand({x:crate.x,y:crate.y,power:3,wandEffect:'web',color:'#ffffff'},crate);var hp=crate.hp;updateWandStatuses(.5)");
  assert.ok(run('crate.hp<hp'));
  run("crate.wandDots={};impactWand({x:crate.x,y:crate.y,power:3,wandEffect:'poison',color:'#ffffff'},crate);hp=crate.hp;updateWandStatuses(.5)");
  assert.ok(run('crate.hp<hp'));
  run("props=[];var a=makeEnemy('slime',{x:player.x+50,y:player.y}),b=makeEnemy('slime',{x:player.x+90,y:player.y});a.hp=b.hp=300;enemies=[a,b];world.scrollFlashes=[];impactWand({x:a.x,y:a.y,from:{x:player.x,y:player.y},power:4,wandEffect:'fireball',color:'#ffffff'},a)");
  assert.ok(run("a.hp<300&&b.hp<300&&!a.burn&&!b.burn&&world.scrollFlashes.some(f=>f.kind==='fireball')"));
  run("a.hp=b.hp=300;world.scrollFlashes=[];impactWand({x:a.x,y:a.y,from:{x:player.x,y:player.y},power:4,wandEffect:'lightning',color:'#ffffff'},a)");
  assert.equal(run("b.hp===300&&world.scrollFlashes.length===1"),true);
  run("world.scrollFlashes=[];impactWand({x:a.x,y:a.y,from:{x:player.x,y:player.y},power:5,wandEffect:'lightning',color:'#ffffff'},a)");
  assert.equal(run("b.hp<300&&world.scrollFlashes.length>=2"),true);
  run("a.rooted=b.rooted=0;impactWand({x:a.x,y:a.y,power:20,wandEffect:'web',color:'#ffffff'},a)");
  assert.equal(run("a.rooted===5&&b.rooted===5&&a.wandDots.web.damage===21"),true);
  run("a.rooted=0;impactWand({x:a.x,y:a.y,power:1,wandEffect:'web',color:'#ffffff'},a)");
  assert.equal(run('a.rooted'),1);
  run('begin()');
});
check('wand gating, old-save migration, settings and robe protection', () => {
  run("begin();world.tiles.fill(1);loot=[];player.scrolls.fireball=2;var oldSword=player.weapon;var scrollDrop={x:player.x,y:player.y,type:'scroll',scroll:'light'};loot.push(scrollDrop);updateScrolls(.1)");
  assert.equal(run("loot.includes(scrollDrop)&&player.scrolls.light===0&&castScroll()===false"),true);
  run("saveRun();savedRun=null;state='title';restoreSavedRun()");
  assert.equal(run("player.scrolls.fireball===0&&loot.filter(i=>i.type==='scroll'&&i.scroll==='fireball').length===2"),true);
  run("var wand={kind:'wand',effect:'fireball',power:5,name:'Fireball Wand +5',damage:10,range:300,cooldown:.55,color:'#ff954d'};player.armor={kind:'plate',slot:'armor',reduction:.3};var item={x:player.x,y:player.y,type:'weapon',weapon:wand};loot.push(item);equipLoot(item);updateScrolls(.01)");
  assert.equal(run("isWand(player.weapon)&&!player.armor&&player.scrolls.light===1"),true);
  run("player.armor=makeRobe(false);var body=reduction(),head=reduction('head');player.armor=makeRobe(true)");
  assert.ok(run("body>head&&reduction('head')>0"));
  run("player.scrolls.fireball=2;var swordItem=loot.find(i=>i.type==='weapon'&&i.weapon===oldSword)||{x:player.x,y:player.y,type:'weapon',weapon:oldSword};if(!loot.includes(swordItem))loot.push(swordItem);equipLoot(swordItem)");
  assert.equal(run("!isWand(player.weapon)&&player.scrolls.fireball===0&&loot.filter(i=>i.type==='scroll'&&i.scroll==='fireball').length>=2"),true);
  run("keyBindings.cycle='v';difficulty='hard';saveRun();keyBindings.cycle='t';difficulty='medium';savedRun=null;restoreSavedRun()");
  assert.equal(run("keyBindings.cycle==='v'&&difficulty==='hard'"),true);
  run("keyBindings.cycle='t';difficulty='medium';begin()");
});
check('wand powers scale by actual floor and effects chain, cloud, root and illuminate', () => {
  run("begin();gearPreferences.enabled=true;gearPreferences.prefer='magic';world.tiles.fill(1);var firstWand={x:player.x+100,y:player.y,type:'weapon',weapon:{kind:'wand',effect:'light',power:1,name:'Light Wand +1',damage:6,range:300,cooldown:.55,color:'#fff'}};loot=[firstWand];updateAutoGear(1)");
  assert.equal(run("player.weapon===firstWand.weapon"),true);
  run("gearPreferences.prefer='ranged';begin()");
  run("begin();loadFloor(6,604);world.tiles.fill(1);props=[];loot=[];var wandSet=[];for(let i=0;i<200;i++){var w=withRealmDepth(makeWeapon);if(w.kind==='wand')wandSet.push(w)}");
  assert.equal(run("wandSet.length>0&&wandSet.every(w=>w.power===6)"),true);
  run("var first=makeEnemy('slime',{x:player.x+40,y:player.y}),second=makeEnemy('slime',{x:player.x+80,y:player.y});first.hp=second.hp=200;enemies=[first,second];impactWand({x:first.x,y:first.y,power:5,wandEffect:'lightning',color:'#abcdef'},first)");
  assert.equal(run('second.hp===190'),true);
  run("impactWand({x:first.x,y:first.y,power:6,wandEffect:'poison',color:'#abcdef'},first);impactWand({x:first.x,y:first.y,power:6,wandEffect:'web',color:'#abcdef'},first)");
  assert.equal(run("world.scrollZones.at(-1).damage===9&&second.rooted===5"),true);
  run("player.weapon={kind:'wand',effect:'light',power:6,cooldown:.55};player.cool=0;attack()");
  assert.equal(run("world.scrollLights.at(-1).coneAngle===player.angle&&world.scrollLights.at(-1).life>5"),true);
  run("begin()");
});
check('local save restores the current world, shared references, timers and random sequence', () => {
  run("begin();loadFloor(8,604);player.weapon={kind:'wand',effect:'light',power:8,range:300,damage:13};player.gold=4321;player.scrolls.light=7;selectedAmmo='light';player.ammoShared.light=8;world.rooms[1].decor[0].broken=true;world.boss.hp-=23;world.quake.next=Infinity;world.scrollLights.push({x:player.x,y:player.y,life:5});var marker={type:'weapon',weapon:{...player.weapon,name:'Saved marker'},x:player.x,y:player.y};loot.push(marker);selectedWorldItem=marker;heroShots.push({hit:new Set([world.boss])});var beforeSeed=seed;var savedBossHp=world.boss.hp;var savedTiles=Array.from(world.tiles).join('');saveRun()");
  assert.equal(run("decodeRun(window.localStorage.getItem(RUN_SAVE_KEY)).player.gold"),4321);
  run("var expectedRandom=rng();player.gold=0;world.boss.hp=1;state='title';savedRun=null");
  assert.equal(run('restoreSavedRun()'),true);
  assert.equal(run("state==='playing'&&depth===8&&player.gold===4321&&player.scrolls.light===7&&selectedAmmo==='regular'&&player.ammoShared.light===0&&loot.some(i=>i.type==='ammo'&&i.special==='light'&&i.value===8)&&player.ammo.bow===player.ammo.crossbow&&player.ammo.bow===player.ammoShared"),true);
  for(const condition of ["world.boss.hp===savedBossHp","enemies.includes(world.boss)","world.rooms[1].decor[0].broken","props.includes(world.rooms[1].decor[0])","heroShots[0].hit.has(world.boss)","selectedWorldItem===loot.find(i=>i.weapon?.name==='Saved marker')","world.quake.next===Infinity","world.scrollLights[0].life===5","Array.from(world.tiles).join('')===savedTiles"])assert.equal(run(condition),true,condition);
  assert.equal(run('rng()'),run('expectedRandom'));
});
check('invalid saves and storage failures are explicit and a dead run cannot be resumed', () => {
  run("begin();var stored=window.localStorage.getItem(RUN_SAVE_KEY);window.localStorage.setItem(RUN_SAVE_KEY,'broken');inspectSavedRun()");
  assert.equal(run("!savedRun&&!saveStatus.hidden&&window.localStorage.getItem(RUN_SAVE_KEY)==='broken'"),true);
  run("window.localStorage.setItem(RUN_SAVE_KEY,stored);state='playing';player.inv=0;player.hp=1;damagePlayer(1000)");
  assert.equal(run("state==='dead'&&window.localStorage.getItem(RUN_SAVE_KEY)===null"),true);
  run("begin();var realSet=window.localStorage.setItem;window.localStorage.setItem=()=>{throw new Error('quota')};saveRun()");
  assert.equal(run("!saveStatus.hidden&&saveStatus.textContent.includes('could not be saved')"),true);
  run("window.localStorage.setItem=realSet;saveRun()");
  assert.equal(run('saveStatus.hidden'),true);
});
check('enemy projectiles and direct sources cannot harm allies or apply status, but still harm player', () => {
  for(const spell of ['ranged','fire','venom']){
    run(`begin();loadFloor(1,604);world.tiles.fill(1);world.traps=[];props=[];player.inv=0;var shooter=makeEnemy('cinder_wizard',{x:player.x+180,y:player.y});var ally=makeEnemy('slime',{x:player.x+80,y:player.y});shooter.cool=ally.cool=1000;shooter.speed=ally.speed=0;enemies=[shooter,ally];var allyHP=ally.hp;var heroHP=player.hp;shoot(shooter,Math.PI,400,'${spell}');baseUpdate(.4)`);
    assert.equal(run('ally.hp===allyHP&&!ally.burn&&!ally.poison&&player.hp===heroHP&&shots.length===0'),true);
    run(`enemies=[shooter];shoot(shooter,Math.PI,400,'${spell}');baseUpdate(.5)`);
    assert.ok(run('player.hp<heroHP'));
  }
  run("var ally=makeEnemy('slime',player);enemies=[ally];var hpBeforeAlly=ally.hp;hurtEnemy(ally,100,shooter)");
  assert.equal(run('ally.hp===hpBeforeAlly'),true);
  run('hurtEnemy(ally,1,player)');assert.equal(run('ally.hp'),run('hpBeforeAlly-1'));
  run('begin()');
});
check('ordinary swarm creatures target only player while activated trap creatures still harm enemies', () => {
  run("loadFloor(1,604);world.tiles.fill(1);world.traps=[];props=[];player.x+=300;var friendly=makeEnemy('slime',{x:player.x-200,y:player.y});var mob=makeEnemy('bug',{x:friendly.x+15,y:friendly.y});Object.assign(mob,{trapSwarm:true,swarmLife:10,emerge:0,cool:0});enemies=[mob,friendly];var friendlyHP=friendly.hp;updateTraps(.01,false)");
  assert.equal(run('friendly.hp===friendlyHP'),true);
  run("mob.trapSource={targetFaction:'enemy'};mob.cool=0;updateTraps(.01,false)");
  assert.ok(run('friendly.hp<friendlyHP'));
  run('begin()');
});
check('eighth-floor boss locks descent, drops a full reward cache, and later boss cycle preserves progression', () => {
  run("begin();loadFloor(8,604);world.traps=[];props=[];var dragon=enemies.find(e=>e.boss);player.gold=100;var keptWeapon=player.weapon;var keptScrolls=JSON.stringify(player.scrolls);var sealedFall=fallToFloor(9,'test');var victorySounds=window.DungeonAudio.diagnostic().events.victory||0;keys.add('w');mouse.down=true;hurtEnemy(dragon,10000);var goldAfterBoss=player.gold;var killsAfterBoss=kills;var rankAfterBoss=player.level;var spoils=loot.slice()");
  assert.equal(run("sealedFall===false&&state==='playing'&&$('overlay').hidden&&keys.has('w')&&mouse.down&&player.crowns===1&&bossDefeated&&loot.some(i=>i.type==='gold'&&i.value===1000)&&loot.some(i=>i.type==='weapon')&&loot.some(i=>i.type==='armor')&&loot.some(i=>i.type==='scroll')&&loot.some(i=>i.type==='ammo')"),true);
  assert.equal(run("effects.filter(p=>p.coin).length"),32);
  assert.equal(run("window.DungeonAudio.diagnostic().events.victory"),run("victorySounds+1"));
  run('hurtEnemy(dragon,10000)');
  assert.equal(run('player.crowns===1&&player.gold===goldAfterBoss&&kills===killsAfterBoss&&window.DungeonAudio.diagnostic().events.victory===victorySounds+1'),true);
  assert.equal(run("state==='playing'&&depth===8&&loot.length===spoils.length&&spoils.every(i=>loot.includes(i))&&player.weapon===keptWeapon"),true);
  run("keys.clear();mouse.down=false;for(let i=0;i<55;i++)update(.04)");
  assert.equal(run('effects.some(p=>p.coin)'),false);
  run("selectedWorldItem=null;player.x=world.end.x;player.y=world.end.y;interact()");
  assert.equal(run("depth===9&&state==='playing'&&!bossDefeated"),true);
  run("loadFloor(16,604);var secondDragon=enemies.find(e=>e.boss)");
  assert.equal(run("secondDragon&&secondDragon.bossName==='The Grave Necromancer'&&world.rooms.every(r=>!r.collapse)&&world.pits.length===0"),true);
  run('hurtEnemy(secondDragon,10000);selectedWorldItem=null;player.x=world.end.x;player.y=world.end.y;interact()');
  assert.equal(run("runCycle===2&&depth===1&&state==='playing'&&!bossDefeated&&player.weapon===keptWeapon&&player.gold===goldAfterBoss&&player.level===rankAfterBoss&&player.crowns===2&&JSON.stringify(player.scrolls)===keptScrolls"),true);
  assert.equal(run("makeEnemy('slime',player).damage"),run('creatures.slime.damage*1.25'));
  run('begin()');assert.equal(run('runCycle===1&&!player.crowns&&player.gold===0'),true);
});
check('all rotating eighth-floor bosses have ranged attacks, melee pressure, and weaker related summons', () => {
  for(let cycle=1;cycle<=8;cycle++){
    run(`runCycle=${cycle};loadFloor(8,604);world.tiles.fill(1);state='playing';var rotatingBoss=world.boss;rotatingBoss.summonTimer=0;updateBossCombat(.01)`);
    assert.equal(run('rotatingBoss.bossName'),run(`BOSS_FORMS[${cycle-1}].name`));
    assert.equal(run("!!rotatingBoss.attack&&rotatingBoss.reach>=270&&rotatingBoss.shotSpeed>=230&&rotatingBoss.meleeCooldown>0"),true);
    assert.ok(run("enemies.some(e=>e.bossMinion&&e.hp<rotatingBoss.hp&&e.damage<rotatingBoss.damage)"),`cycle ${cycle} boss did not summon weaker allies`);
  }
  run('begin()');
});
check('scroll and ammunition cycling skip empty types, wrap without consumption, and reject pause', () => {
  run("begin();player.scrolls={fireball:0,light:2,poison:0,lightning:1};player.selectedScroll='fireball';cycleScroll()");
  assert.equal(run('player.selectedScroll'),'light');
  run('cycleScroll()');assert.equal(run('player.selectedScroll'),'lightning');
  run('cycleScroll()');assert.equal(run('player.selectedScroll'),'light');
  assert.equal(run('JSON.stringify(player.scrolls)'),JSON.stringify({fireball:0,light:2,poison:0,lightning:1}));
  run("player.scrolls.light=player.scrolls.lightning=0;cycleScroll()");
  assert.equal(run('player.selectedScroll'),'light');
  run("player.scrolls.lightning=1;state='paused';cycleScroll()");
  assert.equal(run('player.selectedScroll'),'light');
  run("state='playing';player.ammoShared={light:5,fire:0,explosion:0,poison:5,lightning:0,web:0,charm:0};player.ammo.bow=player.ammo.crossbow=player.ammoShared;player.weapon.kind='bow';cycleAmmo()");
  assert.equal(run("selectedAmmo==='light'&&player.ammoChoice.bow==='light'&&player.ammoChoice.crossbow==='light'"),true);
  run("player.weapon.kind='rifle';cycleAmmo()");
  assert.equal(run("selectedAmmo==='poison'&&player.ammoChoice.crossbow==='poison'"),true);
  run("player.weapon.kind='boomerang';cycleAmmo()");
  assert.equal(run("selectedAmmo==='regular'&&player.ammoShared.poison+player.ammoShared.light===10"),true);
  run('begin()');
});
check('automatic equipment respects preference, distance and sight, upgrades slots without oscillation', () => {
  run("begin();loadFloor(1,604);enemies=[];props=[];world.tiles.fill(1);var original=player.weapon;var upgrade={x:player.x+150,y:player.y,type:'weapon',weapon:{...original,damage:original.damage+5}};loot=[upgrade];updateAutoGear()");
  assert.equal(run('player.weapon===original&&loot.includes(upgrade)'),true);
  run("gearPreferences.enabled=true;gearPreferences.prefer='ranged';updateAutoGear()");
  assert.equal(run('player.weapon===original'),true);
  run("gearPreferences.prefer='melee';upgrade.x+=.01;updateAutoGear()");
  assert.equal(run('player.weapon===original'),true);
  run('upgrade.x-=.01;updateAutoGear(1);updateAutoGear(1)');
  assert.equal(run('player.weapon===upgrade.weapon&&loot.length===1&&loot[0].weapon===original'),true);
  run("gearPreferences.prefer='ranged';var ranged={x:player.x+100,y:player.y,type:'weapon',weapon:{...weaponTypes.bow,kind:'bow',name:'Bow',damage:original.damage}};loot=[ranged];updateAutoGear()");
  assert.equal(run('player.weapon===upgrade.weapon'),true);
  run('ranged.weapon.damage=upgrade.weapon.damage+1;updateAutoGear(1)');
  assert.equal(run('player.weapon===ranged.weapon'),true);
  run("var armor={x:player.x+100,y:player.y,type:'armor',armor:{...makeArmor('boots'),kind:'chain'}};loot=[armor];state='paused';updateAutoGear()");
  assert.equal(run('!player.boots'),true);
  run("state='playing';updateAutoGear(1);updateAutoGear(1)");
  assert.equal(run('player.boots===armor.armor&&loot.length===0'),true);
  run("var downgrade={...armor,armor:{...armor.armor,reduction:armor.armor.reduction-.01}};loot=[downgrade];updateAutoGear()");
  assert.equal(run('loot.includes(downgrade)'),true);
  run("loot=[{...upgrade,x:player.x+100,weapon:{...upgrade.weapon,damage:999}}];gearPreferences.prefer='melee';var blockX=Math.floor((player.x+40)/T),blockY=Math.floor(player.y/T);world.tiles[blockY*W+blockX]=0;updateAutoGear()");
  assert.equal(run('player.weapon===ranged.weapon'),true);
  run("world.tiles.fill(1);gearPreferences.enabled=false;begin()");
});
check('automatic weapon comparison favors power then recovery and reach, never equal gear', () => {
  run("var baseline=player.weapon;var candidate={type:'weapon',weapon:{...baseline}};gearPreferences.prefer='melee'");
  assert.equal(run('betterAutoGear(candidate)'),false);
  run('candidate.weapon.cooldown=baseline.cooldown-.01');
  assert.equal(run('betterAutoGear(candidate)'),true);
  run('candidate.weapon.damage=baseline.damage-1');
  assert.equal(run('betterAutoGear(candidate)'),false);
  run('candidate.weapon={...baseline,range:baseline.range+1}');
  assert.equal(run('betterAutoGear(candidate)'),true);
});
check('only Entrance Hall has a room label in the HUD or world renderer', () => {
  run("begin();loadFloor(1,604);enemies=[];world.traps=[];update(.01)");
  assert.equal(elements.get('roomName').textContent,'Entrance Hall');
  run("player.x=(world.rooms[1].x+world.rooms[1].w/2)*T;player.y=(world.rooms[1].y+world.rooms[1].h/2)*T;update(.01)");
  assert.equal(elements.get('roomName').textContent,'');
  assert.ok(html.includes("if(r.kind==='entrance')"));
});
check('merchant buys one carried potion or each scroll once per valid transaction, not outside the shop', () => {
  run("loadFloor(2,604);player.gold=0;player.potions=1;player.scrolls={fireball:1,light:1,poison:1,lightning:1}");
  assert.equal(run("sellConsumable('potion')"),false);
  run("openShop()");
  for(const id of ['potion','fireball','light','poison','lightning']){
    assert.equal(run(`sellConsumable('${id}')`),true);
    assert.equal(run(`sellConsumable('${id}')`),false);
  }
  assert.equal(run('player.gold'),56);
  assert.equal(run("sellConsumable('__proto__')"),false);
  assert.equal(run('player.gold'),56);
  run('closeShop()');
});
check('spiderlings converge on the room center and surviving brood determines giant strength', () => {
  for(const survivors of [1,9,18]){
    run(`begin();loadFloor(1,604);world.traps=[];var nest=world.rooms.find(r=>r.kind==='spider'),parent=nest.parent;player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T;updateNestsAndPits(4,player);var brood=enemies.filter(e=>e.baby);brood.slice(${survivors}).forEach(e=>e.hp=0);var baby=brood[0],center={x:player.x,y:player.y},oldDistance=distance(baby,center);updateNestsAndPits(.1,player)`);
    assert.ok(run('distance(baby,center)<oldDistance&&baby.hp>0&&!nest.broodGiant'),JSON.stringify(run('({oldDistance,newDistance:distance(baby,center),hp:baby.hp,giant:!!nest.broodGiant,x:baby.x,y:baby.y,center})')));
    run("saveRun();savedRun=null;restoreSavedRun();nest=world.rooms.find(r=>r.kind==='spider');player.x=world.start.x;player.y=world.start.y;for(let i=0;i<80&&!nest.broodGiant;i++)updateNestsAndPits(.1,player)");
    assert.equal(run(`nest.broodGiant.broodCount===${survivors}&&nest.broodGiant.giant&&nest.parent!==nest.broodGiant`),true);
    assert.ok(run(`Math.abs(nest.broodGiant.damage-nest.parent.damage*(1+${survivors}/9))<1e-8`));
    assert.ok(run(`Math.abs(nest.broodGiant.max-nest.parent.max*(1+${survivors}/9))<1e-8`));
    run('updateNestsAndPits(5,player)');
    assert.equal(run('enemies.filter(e=>e.giant).length'),1);
  }
});
check('destroyed eggs and spiderlings cannot form a giant, including after leaving the room', () => {
  for(const cleared of ['eggs','babies']){
    run("begin();loadFloor(1,604);world.traps=[];var nest=world.rooms.find(r=>r.kind==='spider');player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T");
    if(cleared==='eggs')run('nest.decor.forEach(p=>breakProp(p,999))');
    run('updateNestsAndPits(4,player)');
    if(cleared==='babies')run('enemies.filter(e=>e.baby).forEach(e=>e.hp=0)');
    run('player.x=world.start.x;player.y=world.start.y;updateNestsAndPits(5,player)');
    assert.equal(run('enemies.some(e=>e.giant)'),false);
  }
});
check('corridor midpoint activates the adjacent room and its eggs', () => {
  run("begin();world.tiles.fill(0);world.rooms=[{x:2,y:5,w:4,h:3,kind:'entrance',decor:[]},{x:12,y:5,w:4,h:3,kind:'spider',decor:[],hatchStarted:false,hatchTimer:0}];for(let y=5;y<8;y++)for(let x=2;x<16;x++)world.tiles[y*W+x]=1;player.x=8.99*T;player.y=6.5*T;world.webs=[]");
  assert.equal(run('roomAtPosition(player)'),0);
  run('updateNestsAndPits(.01,player)');assert.equal(run('world.rooms[1].hatchStarted'),false);
  run('player.x=9.01*T;updateNestsAndPits(.01,player)');
  assert.equal(run('roomAtPosition(player)===1&&world.rooms[1].hatchStarted'),true);
  run('saveRun();savedRun=null;restoreSavedRun()');
  assert.equal(run('roomAtPosition(player)===1&&world.rooms[1].hatchStarted'),true);
});
check('room activation follows vertical and turning corridor midpoints', () => {
  run("begin();world.tiles.fill(0);world.rooms=[{x:5,y:2,w:3,h:4,kind:'entrance'},{x:5,y:12,w:3,h:4,kind:'spider'}];for(let y=2;y<16;y++)for(let x=5;x<8;x++)world.tiles[y*W+x]=1;player.x=6.5*T;player.y=8.99*T");
  assert.equal(run('roomAtPosition(player)'),0);
  run('player.y=9.01*T');assert.equal(run('roomAtPosition(player)'),1);
  run("begin();world.tiles.fill(0);world.rooms=[{x:2,y:2,w:4,h:4,kind:'entrance'},{x:12,y:12,w:4,h:4,kind:'spider'}];for(let y=2;y<6;y++)for(let x=2;x<6;x++)world.tiles[y*W+x]=1;for(let y=12;y<16;y++)for(let x=12;x<16;x++)world.tiles[y*W+x]=1;for(let x=6;x<=13;x++)world.tiles[4*W+x]=1;for(let y=5;y<12;y++)world.tiles[y*W+13]=1;player.x=12.5*T;player.y=4.5*T");
  assert.equal(run('roomAtPosition(player)'),0);
  run('player.x=13.5*T;player.y=5.5*T');assert.equal(run('roomAtPosition(player)'),1);
});
check('giant web strikes inflict tripled base damage and root; normal webs remain root-only and dodge protects', () => {
  run("loadFloor(1,604);world.tiles.fill(1);props=[];world.traps=[];player.armor=player.boots=player.gloves=player.helmet=null;player.hp=120;player.inv=0;var giantStriker=makeEnemy('cave_spider',{x:player.x+120,y:player.y});giantStriker.attackAngle=Math.PI;enemies=[giantStriker];strikeWeb(giantStriker)");
  assert.equal(run('player.hp===120&&player.root===1'),true);
  run('player.root=0;giantStriker.giant=true;giantStriker.damage*=3;strikeWeb(giantStriker)');
  assert.equal(run('player.hp===120-creatures.cave_spider.damage*3&&player.root===1'),true);
  run('player.root=0;player.inv=.3;var hpAfterWeb=player.hp;strikeWeb(giantStriker)');
  assert.equal(run('player.hp===hpAfterWeb&&player.root===0'),true);
});
check('a direct spider web hit roots the knight then drives the spider into an immediate fast melee attack', () => {
  run("loadFloor(1,604);world.tiles.fill(1);props=[];world.traps=[];player.armor=player.boots=player.gloves=player.helmet=null;player.hp=120;player.inv=0;state='playing';var webStriker=makeEnemy('cave_spider',{x:player.x+120,y:player.y});webStriker.attackAngle=Math.PI;webStriker.cool=10;enemies=[webStriker];strikeWeb(webStriker)");
  assert.equal(run('player.root===1&&webStriker.webLunge&&webStriker.lunge>0'),true);
  run('update(.2)');
  assert.equal(run('player.hp===120-creatures.cave_spider.damage&&player.root>0&&webStriker.lunge===0&&!webStriker.webLunge'),true);
});
check('gold and eligible consumables vacuum at 150 units', () => {
  run("begin();loadFloor(1,604);player.weapon={kind:'wand',effect:'light',power:1};enemies=[];props=[];world.traps=[];player.dash=0;var pickupX=player.x;var startGold=player.gold;var startPotions=player.potions;var startScroll=player.scrolls.light;var kinds=[{type:'gold',value:17},{type:'scroll',scroll:'light'},{type:'potion'},...['bow','crossbow'].flatMap(ammoKind=>['fire','poison','explosion','light','lightning','web','charm'].map(special=>({type:'ammo',ammoKind,special})))];var nearPickups=kinds.map(k=>({...k,x:player.x+3.75*T,y:player.y}));var farPickups=kinds.map(k=>({...k,x:player.x+3.75*T+.01,y:player.y}));var manualGear=['weapon','armor'].map(type=>({x:player.x+100,y:player.y,type}));loot=[...nearPickups,...farPickups,...manualGear];baseUpdate(.04)");
  assert.equal(run("nearPickups.filter(i=>i.type!=='ammo').every(item=>item.x<pickupX+150)&&nearPickups.filter(i=>i.type==='ammo').every(item=>item.x===pickupX+150)&&farPickups.every(item=>item.x===pickupX+150.01)&&manualGear.every(item=>item.x===pickupX+100)"),true);
  run('for(let i=0;i<30;i++){baseUpdate(.04);updateScrolls(.04)}');
  assert.equal(run('player.gold===startGold+17&&player.potions===startPotions+1&&player.scrolls.light===startScroll+1'),true);
  assert.equal(run("nearPickups.filter(i=>i.type==='ammo').every(item=>loot.includes(item))"),true);
  run("player.weapon={kind:'bow'};for(let i=0;i<30;i++){baseUpdate(.04);updateScrolls(.04)}");
  assert.equal(run("['bow','crossbow'].every(k=>['fire','poison','explosion','light','lightning','web','charm'].every(s=>player.ammo[k][s]===10))"),true);
  assert.equal(run('nearPickups.every(item=>!loot.includes(item))&&farPickups.every(item=>loot.includes(item))&&manualGear.every(item=>loot.includes(item))'),true);
});
check('all normal drops expire at 30 seconds; weapon-switch inventory expires at 10 and timers survive resume', () => {
  run("begin();loadFloor(1,604);enemies=[];props=[];world.traps=[];gearPreferences.enabled=false;player.weapon={kind:'bow',name:'Bow',damage:10,color:'#fff',range:200};player.armor={kind:'leather',slot:'armor',name:'Leather',reduction:.1};player.ammoShared.fire=5;var newWand={x:player.x,y:player.y,type:'weapon',weapon:{kind:'wand',name:'Wand',effect:'light',color:'#fff',damage:10,range:200}};loot=[newWand];equipLoot(newWand);player.scrolls.light=1;var sword={x:player.x,y:player.y,type:'weapon',weapon:{kind:'sword',name:'Sword',color:'#fff',damage:10,range:60}};loot.push(sword);equipLoot(sword)");
  assert.equal(run("['armor','ammo','scroll'].every(type=>loot.some(i=>i.type===type&&i.weaponSwitchDrop))&&loot.filter(i=>i.type==='weapon').every(i=>!i.weaponSwitchDrop)"),true);
  run("for(const i of loot){i.x=player.x+400;i.y=player.y} var normal=['gold','potion','scroll','ammo','weapon','armor'].map(type=>({x:player.x+400,y:player.y,type}));loot.push(...normal);baseUpdate(5.21)");
  assert.equal(run("loot.filter(i=>i.weaponSwitchDrop).every(i=>!lootVisible(i))&&normal.every(lootVisible)"),true);
  run("saveRun();savedRun=null;restoreSavedRun()");
  assert.equal(run("loot.filter(i=>i.weaponSwitchDrop).length===3&&loot.filter(i=>i.weaponSwitchDrop).every(i=>i.age>5)"),true);
  run("var frozenAge=loot[0].age;state='paused';frame(3000)");
  assert.equal(run("state==='paused'&&loot[0].age===frozenAge"),true);
  run("state='playing'");
  run("baseUpdate(4.78)");
  assert.equal(run("loot.filter(i=>i.weaponSwitchDrop).length===3"),true);
  run("baseUpdate(.02)");
  assert.equal(run("!loot.some(i=>i.weaponSwitchDrop)&&loot.length===8"),true);
  run("baseUpdate(15.2)");
  assert.equal(run("loot.every(i=>!lootVisible(i))"),true);
  run("baseUpdate(4.78)");
  assert.equal(run("loot.length===8"),true);
  run("baseUpdate(.02)");
  assert.equal(run("loot.length===0"),true);
  run("var timedGear={x:player.x+40,y:player.y,type:'weapon',weapon:makeWeapon(),age:29};loot=[timedGear];selectedWorldItem=timedGear;deleteSelectedGear();baseUpdate(5);undoGearDelete();undoGearDelete()");
  assert.equal(run('loot.length===1&&loot[0]===timedGear&&timedGear.age===29'),true);
  run('baseUpdate(1.01)');
  assert.equal(run('loot.length'),0);
});
check('hidden traps ignore monsters; disarmed traps trigger on monsters without harming the player', () => {
  for(const type of ['slime','bug','bat','cave_spider','cinder_wizard']){
    for(const revealed of [false,true]){
      run(`loadFloor(1,604);world.tiles.fill(1);props=[];loot=[];var inert={x:player.x+100,y:player.y,kind:'explosion',revealed:${revealed},inspect:0,active:0};world.traps=[inert];var passer=makeEnemy('${type}',inert);passer.hp=300;passer.trapSwarm=${type==='bug'||type==='bat'};passer.emerge=10;enemies=[passer];updateTraps(.1,false)`);
      assert.equal(run('!!inert.triggered'),revealed,`${type}, revealed=${revealed}`);
      assert.equal(run('passer.hp'),revealed?268:300);
    }
  }
});
check('active hazards catch late-arriving ordinary monsters spiderlings and trap swarms without swarm loot', () => {
  for(const type of ['slime','bug','bat','cave_spider','cinder_wizard']){
    for(const kind of ['poison','fire','explosion','quicksand','trapdoor']){
      run(`loadFloor(1,604);world.tiles.fill(1);props=[];loot=[];enemies=[];var liveTrap={x:player.x+120,y:player.y,kind:'${kind}',revealed:true};world.traps=[liveTrap];triggerTrap(liveTrap,true);var entrant=makeEnemy('${type}',liveTrap);entrant.hp=300;entrant.trapSwarm=${type==='bug'||type==='bat'||type==='cave_spider'};entrant.baby=${type==='cave_spider'};entrant.emerge=10;enemies=[entrant];updateTraps(.01,false)`);
      if(kind==='poison')assert.equal(run('entrant.poison>0&&entrant.hp<300'),true);
      if(kind==='fire')assert.equal(run('entrant.burn>0&&entrant.hp<300'),true);
      if(kind==='explosion')assert.equal(run('entrant.hp'),268);
      if(kind==='quicksand')assert.ok(run('entrant.slow>0'));
      if(kind==='trapdoor'){
        assert.equal(run('entrant.hp'),0);
        assert.equal(run('depth'),1);
        if(type!=='slime'&&type!=='cinder_wizard')assert.equal(run('loot.length'),0);
      }
    }
  }
});
check('activated bug and bat broods attack approaching trap creatures but do not attack their own brood', () => {
  for(const kind of ['bugs','bats']){
    run(`loadFloor(1,604);world.tiles.fill(1);props=[];loot=[];enemies=[];player.x=world.start.x-150;var broodTrap={...world.start,kind:'${kind}',revealed:true};world.traps=[];triggerTrap(broodTrap,true);var brood=enemies.slice();var fighter=brood[0];var outsider=makeEnemy('bug',{x:fighter.x+20,y:fighter.y});outsider.hp=100;outsider.trapSwarm=true;outsider.emerge=10;enemies.push(outsider);fighter.emerge=0;fighter.cool=0;updateTraps(.01,false)`);
    assert.ok(run('outsider.hp<100'));
    assert.equal(run('brood.slice(1).every(e=>e.hp===e.max)'),true);
  }
});
check('barrel and box remnants and opened chests clear on a second melee or projectile hit without extra loot', () => {
  for(const kind of ['sword','bow','crossbow']){
    for(const type of ['barrel','crate','chest']){
      run(`loadFloor(1,604);world.tiles.fill(1);world.torches=[];enemies=[];loot=[];player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:100};var remnant={x:player.x+40,y:player.y,type:'${type}',hp:1,open:false};props=[remnant];breakProp(remnant,100)`);
      if(type==='chest'){
        assert.equal(run('remnant.open'),false,'unopened chest must be protected');
        run('interact()');
      }
      assert.equal(run('remnant.open&&!remnant.destroyed'),true);
      const earned=run('loot.length');
      run('player.cool=0;attack();if(heroShots.length)updateHeroShots(.2)');
      assert.equal(run('remnant.destroyed&&!blocksShot(remnant)'),true,`${kind} ${type}`);
      assert.equal(run('loot.length'),earned,'clearing remains duplicated loot');
      run('breakProp(remnant,999)');
      assert.equal(run('loot.length'),earned);
    }
  }
});
check('spider webs track current position and strike immediately after charge; cover dodge and sanctuaries protect', () => {
  run("loadFloor(1,604);world.tiles.fill(1);props=[];world.traps=[];player.inv=0;player.dash=0;var snapSpider=makeEnemy('cave_spider',{x:player.x+150,y:player.y});enemies=[snapSpider];snapSpider.cool=0;update(.01);player.y+=40;update(snapSpider.wind+.001)");
  assert.equal(run('player.root'),1);
  assert.equal(run("shots.some(s=>s.type==='web')"),false);
  for(const blocked of ['wall','chest','dodge','range','sanctuary']){
    run(`loadFloor(${blocked==='sanctuary'?2:1},604);world.tiles.fill(1);props=[];world.traps=[];player.inv=0;player.root=0;var guardedSpider=makeEnemy('cave_spider',{x:player.x+150,y:player.y});enemies=[guardedSpider]`);
    if(blocked==='wall')run('world.tiles[Math.floor(player.y/T)*W+Math.floor((player.x+70)/T)]=0');
    if(blocked==='chest')run("props=[{x:player.x+70,y:player.y,type:'chest',open:false}]");
    if(blocked==='dodge')run('player.inv=.3');
    if(blocked==='range')run('guardedSpider.x=player.x+400');
    run('shoot(guardedSpider,0,430,"web")');
    assert.equal(run('player.root'),0,blocked);
  }
});
check('elemental packs grant exactly five, preserve inventories on descent, reset on new run', () => {
  run("begin();loot=[];for(let i=0;i<100;i++)drops(player,true)");
  assert.equal(run("['bow','crossbow'].every(kind=>Object.keys(ammoColors).every(special=>loot.some(l=>l.type==='ammo'&&l.ammoKind===kind&&l.special===special&&l.value===5)))"),true);
  run("player.weapon={kind:'bow'};loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'bow',special:'fire',value:5}];updateScrolls(.01);updateScrolls(.01)");
  assert.equal(run("player.ammo.bow.fire===5&&player.ammoChoice.bow==='regular'"),true);
  run('loadFloor(2,604)');assert.equal(run('player.ammo.bow.fire'),5);
  run('begin()');assert.equal(run('player.ammo.bow.fire'),0);
});
check('all ranged weapons share every special-ammo type and fall back to regular when depleted', () => {
  for(const kind of ['bow','crossbow','boomerang','javelin','knife','throwing_axe','rifle','pistol'])
   for(const special of ['light','fire','explosion','poison','lightning','web','charm']){
    run(`loadFloor(1,604);world.tiles.fill(1);world.torches=[];enemies=[];props=[];player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:20};player.ammoShared.${special}=5;selectedAmmo='${special}';heroShots=[];player.cool=0;state='playing';attack();attack();var shotCount=heroShots.length`);
    assert.equal(run(`heroShots.length===1&&heroShots[0].special==='${special}'&&player.ammoShared.${special}===4`),true,`${kind} failed to spend ${special}`);
    run(`for(let i=0;i<5;i++){player.cool=0;if('${kind}'==='boomerang')heroShots=[];var beforeShots=heroShots.length;attack();if(heroShots.length>beforeShots)shotCount++}`);
    assert.equal(run(`player.ammoShared.${special}===0&&selectedAmmo==='regular'&&heroShots.at(-1).special===null`),true,`${kind} did not return to regular ammunition`);
    run("state='paused';player.cool=0;attack()");
    assert.equal(run(`heroShots.length===('${kind}'==='boomerang'?1:6)&&shotCount===6`),true,`${kind}/${special} shot-count check`);
  }
});
check('all seven ammunition effects resolve on projectile impact', () => {
  for(const special of ['light','fire','explosion','poison','lightning','web','charm']){
    run(`loadFloor(1,604);world.tiles.fill(1);world.torches=[];props=[];player.angle=0;player.cool=0;state='playing';player.weapon={...weaponTypes.rifle,kind:'rifle',damage:20};player.ammoShared.${special}=1;selectedAmmo='${special}';var ammoVictim=makeEnemy('slime',{x:player.x+100,y:player.y});ammoVictim.hp=500;enemies=[ammoVictim];attack();updateHeroShots(.3)`);
    if(special==='fire'||special==='poison')assert.equal(run(`ammoVictim.${special==='fire'?'burn':'poison'}`),4);
    if(special==='explosion')assert.ok(run('ammoVictim.hp<450'));
    if(special==='light'){
      run('updateHeroShots(2)');
      assert.equal(run('world.scrollLights.length===1&&world.scrollLights[0].life===5'),true);
      run('updateScrolls(4.99)');assert.equal(run('world.scrollLights.length'),1);
      run('updateScrolls(.02)');assert.equal(run('world.scrollLights.length'),0);
    }
    if(special==='lightning')assert.ok(run('ammoVictim.hp<500'));
    if(special==='web')assert.ok(run('ammoVictim.rooted>0'));
    if(special==='charm')assert.ok(run('ammoVictim.charmed>0'));
    assert.equal(run('heroShots.length'),0);
  }
});
check('light arrows and bolts illuminate in flight and leave one wall-bounded light on the impact surface', () => {
  for(const kind of ['bow','crossbow'])for(const hit of ['wall','enemy','crate','range']){
    run(`loadFloor(1,604);world.tiles.fill(1);world.torches=[];enemies=[];props=[];
      player.x=420;player.y=420;player.angle=0;player.cool=0;state='playing';
      player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:20,range:230};
      player.ammo.${kind}.light=1;player.ammoChoice.${kind}='light';
      if('${hit}'==='wall')for(let y=0;y<H;y++)world.tiles[y*W+15]=0;
      if('${hit}'==='enemy'){var impactEnemy=makeEnemy('slime',{x:600,y:420});impactEnemy.hp=300;enemies=[impactEnemy]}
      if('${hit}'==='crate')props=[{x:600,y:420,type:'crate',hp:100,open:false}];
      attack();var lightRound=heroShots[0];updateHeroShots(.08)`);
    assert.ok(run('lightRound.x>player.x&&torchIllumination({x:lightRound.x,y:lightRound.y+30})>.3&&world.scrollLights.length===0'));
    run('updateHeroShots(.6);updateHeroShots(.1)');
    assert.ok(run('heroShots.length===0&&world.scrollLights.length===1&&world.scrollLights[0].x===lightRound.x&&world.scrollLights[0].y===420'));
    if(hit==='wall')assert.ok(run('lightRound.x>599.99&&lightRound.x<600&&torchIllumination({x:660,y:420})===0'));
    if(hit==='enemy')assert.ok(run('lightRound.x>600&&impactEnemy.hp<300'));
    if(hit==='crate')assert.ok(run('lightRound.x===580&&props[0].hp<100'));
  }
});
check('light ammunition pierces three distinct monsters, survives save, and stops at walls', () => {
  for(const kind of ['bow','boomerang','rifle']){
    run(`begin();world.tiles.fill(1);world.torches=[];props=[];world.merchant=null;player.x=400;player.y=400;player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:20,range:600};player.ammoShared.light=1;selectedAmmo='light';player.cool=0;enemies=[470,540,610,680].map(x=>{const e=makeEnemy('slime',{x,y:400});e.hp=300;return e});attack();updateHeroShots(.15);saveRun();savedRun=null;restoreSavedRun();for(let i=0;i<30&&heroShots.length;i++)updateHeroShots(.05)`);
    assert.equal(run("enemies.slice(0,3).every(e=>e.hp===278)&&enemies[3].hp===300&&heroShots.length===0&&world.scrollLights.length===1"),true,kind);
  }
  run("begin();world.tiles.fill(1);world.torches=[];props=[];player.x=400;player.y=420;player.angle=0;player.weapon={...weaponTypes.rifle,kind:'rifle',damage:20,range:600};player.ammoShared.light=1;selectedAmmo='light';player.cool=0;enemies=[470,650].map(x=>{const e=makeEnemy('slime',{x,y:420});e.hp=300;return e});for(let y=0;y<H;y++)world.tiles[y*W+15]=0;attack();updateHeroShots(1)");
  assert.equal(run("enemies[0].hp<300&&enemies[1].hp===300&&heroShots.length===0&&world.scrollLights.length===1"),true);
});
check('melee and projectiles can extinguish and relight a torch exactly once per shot', () => {
  for(const kind of run('Object.keys(weaponTypes)')){
    run(`loadFloor(1,604);world.tiles.fill(1);props=[];enemies=[];player.angle=0;player.cool=0;state='playing';var struck={x:player.x+34,y:player.y,lit:true};world.torches=[struck];player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:20};heroShots=[];attack();if(heroShots.length)updateHeroShots(.2)`);
    assert.equal(run('struck.lit'),false,kind);
    run('heroShots=[];player.cool=0;attack();if(heroShots.length)updateHeroShots(.2)');
    assert.equal(run('struck.lit'),true,kind);
  }
});
check('entering nests hatches only intact eggs into lootless converging spiderlings', () => {
  run("loadFloor(1,604);enemies=[];world.traps=[];var nest=world.rooms.find(r=>r.kind==='spider');var egg=nest.decor[0];breakProp(egg,999);loot=[];updateNestsAndPits(5,player)");
  assert.equal(run('enemies.length'),0);
  run('player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T;updateNestsAndPits(.01,player)');
  assert.ok(run('nest.hatchTimer>3.9'));
  run('updateNestsAndPits(4,player)');
  assert.equal(run('enemies.filter(e=>e.baby).length'),15);
  assert.equal(run('enemies.every(e=>e.speed===245&&e.hp===10&&e.trapSwarm)'),true);
  run("var baby=enemies[0];var prevDistance=distance(baby,player);updateNestsAndPits(.1,player)");
  assert.ok(run('distance(baby,player)<prevDistance'));
  run('for(const baby of enemies)hurtEnemy(baby,999)');
  assert.equal(run('loot.length'),0);
});
check('web root blocks movement and dodge displacement then expires after one active second', () => {
  run("loadFloor(1,604);props=[];enemies=[];world.traps=[];player.root=1;var rootX=player.x;move(player,20,0)");
  assert.equal(run('player.x'),run('rootX'));
  run("update(.5);move(player,20,0)");assert.equal(run('player.x'),run('rootX'));
  run("update(.51);move(player,20,0)");assert.equal(run('player.x'),run('rootX+20'));
});
check('rare collapsing rooms warn then open exact-one-floor pits, never on final floor or sanctuaries', () => {
  run("loadFloor(3,604);enemies=[];world.traps=[];var unstable=world.rooms.find(r=>r.kind==='abandoned');player.x=(unstable.x+unstable.w/2)*T;player.y=(unstable.y+unstable.h/2)*T;unstable.collapse={timer:0,warning:null,count:0};updateNestsAndPits(.01,player)");
  assert.equal(run('world.pits.length===0&&unstable.collapse.warning.life===2'),true);
  run('updateNestsAndPits(1,player)');assert.equal(run('world.pits.length'),0);
  run('updateNestsAndPits(1,player)');
  // The tile may already have taken the player down if it formed under them.
  if(run('depth')===3){
    assert.equal(run('world.pits.length'),1);
    run('var pit=world.pits[0];player.x=pit.x+35;player.y=pit.y;var pitBefore={...player};player.x=pit.x-35;updateNestsAndPits(.01,pitBefore)');
  }
  assert.equal(run('depth'),4);
  run('loadFloor(10,604)');assert.equal(run('world.rooms.every(r=>!r.collapse)&&world.pits.length===0'),true);
  run('loadFloor(3,604)');assert.equal(run("world.rooms.filter(r=>r.kind==='entrance'||r.kind==='throne').every(r=>!r.collapse)"),true);
  let candidates=0,total=0;
  for(let seed=0;seed<100;seed++){run(`loadFloor(2,${seed})`);candidates+=run('world.rooms.filter(r=>r.collapse).length');total+=10}
  assert.ok(candidates>10&&candidates<total*.08,`${candidates}/${total} collapsing rooms`);
});
check('scroll inventory starts fresh, persists between floors, and every kind is obtainable', () => {
  run('begin()');
  assert.equal(run('Object.values(player.scrolls).every(count=>count===0)'),true);
  run("player.scrolls.fireball=3;world.scrollLights.push({life:25});world.scrollZones.push({life:6});loadFloor(3,604)");
  assert.equal(run('player.scrolls.fireball'),3);
  assert.equal(run('world.scrollLights.length+world.scrollZones.length'),0);
  run("loot=[];for(let i=0;i<80;i++)drops(player,true)");
  assert.equal(run("Object.keys(scrollTypes).every(kind=>loot.some(item=>item.type==='scroll'&&item.scroll===kind))"),true);
  run("player.weapon={kind:'wand',effect:'light',power:1};loot=[{x:player.x,y:player.y,type:'scroll',scroll:'fireball'}];updateScrolls(.01);updateScrolls(.01)");
  assert.equal(run('player.scrolls.fireball'),4);
  run("loot=[];drops({...player,trapSwarm:true},true)");
  assert.equal(run('loot.length'),0);
  run('begin()');
  assert.equal(run('Object.values(player.scrolls).every(count=>count===0)'),true);
});
check('scroll casts consume exactly once, reject pause walls cooldown and empty inventory', () => {
  run("loadFloor(1,604);player.weapon={kind:'wand',effect:'light',power:1};player.scrolls.fireball=1;state='paused';player.selectedScroll='fireball'");
  assert.equal(run('castScroll()'),false);
  assert.equal(run('player.scrolls.fireball'),1);
  run("state='playing';props=[];enemies=[];world.tiles.fill(1);player.angle=0;world.tiles[Math.floor(player.y/T)*W+Math.floor((player.x+8)/T)]=0");
  assert.equal(run('castScroll()'),false);
  assert.equal(run('player.scrolls.fireball'),1);
  run('world.tiles.fill(1);player.scrolls.fireball=2');
  assert.equal(run('castScroll()'),true);
  assert.equal(run('castScroll()'),false);
  assert.equal(run('player.scrolls.fireball'),1);
  run('updateScrolls(.5)');
  assert.equal(run('castScroll()'),true);
  run('updateScrolls(.5)');
  assert.equal(run('castScroll()'),false);
  assert.equal(run('player.scrolls.fireball'),0);
});
check('fireball burns and lightning strikes actual targets without crossing walls or intact obstacles', () => {
  for(const kind of ['fireball','lightning']){
    run(`loadFloor(1,604);state='playing';world.tiles.fill(1);props=[];loot=[];player.angle=0;player.scrolls.${kind}=2;player.scrollCooldown=0;player.selectedScroll='${kind}';
      var scrollTarget=makeEnemy('slime',{x:player.x+100,y:player.y});scrollTarget.hp=500;enemies=[scrollTarget];castScroll()`);
    assert.equal(run('scrollTarget.hp'),kind==='fireball'?444:399);
    if(kind==='fireball')assert.equal(run('scrollTarget.burn'),3);
    run(`player.scrollCooldown=0;scrollTarget.hp=500;var shieldBox={x:player.x+35,y:player.y,type:'crate',hp:100,open:false};props=[shieldBox];castScroll()`);
    if(kind==='lightning')assert.equal(run('scrollTarget.hp'),500);
    assert.ok(run('shieldBox.hp<100'));
    run(`player.scrolls.${kind}=1;player.scrollCooldown=0;props=[];scrollTarget.x=player.x+120;scrollTarget.hp=500;world.tiles[Math.floor(player.y/T)*W+Math.floor((player.x+60)/T)]=0;castScroll()`);
    assert.equal(run('scrollTarget.hp'),500);
  }
});
check('poison scroll lingers and poisons late-arriving foes then expires', () => {
  run("loadFloor(1,604);state='playing';world.tiles.fill(1);props=[];enemies=[];player.angle=0;player.scrolls.poison=1;player.selectedScroll='poison';player.scrollCooldown=0;castScroll();updateScrolls(1);var cloud=world.scrollZones[0];var poisoned=makeEnemy('slime',{x:cloud.x,y:cloud.y});enemies=[poisoned];var poisonBefore=poisoned.hp;updateScrolls(.5)");
  assert.equal(run('poisoned.poison'),3);
  assert.equal(run('poisoned.hp===poisonBefore-8&&player.scrolls.poison===0'),true);
  run('updateScrolls(6)');
  assert.equal(run('world.scrollZones.length'),0);
});
check('light scroll shares wall-bounded radial glint lighting and expires without toggling torches', () => {
  run("loadFloor(1,604);state='playing';props=[];enemies=[];world.torches.forEach(t=>t.lit=false);player.selectedScroll='light';player.scrolls.light=1;player.scrollCooldown=0;castScroll()");
  assert.ok(run('torchIllumination(player)>.9&&world.scrollLights.length===1&&world.torches.every(t=>!t.lit)'));
  run('updateScrolls(25)');
  assert.ok(run('torchIllumination(player)>0'));
  assert.equal(run('world.scrollLights.length'),0);
  run('begin()');
});
check('hidden hoards use small seeded odds and grant exactly one boosted floor weapon only after inspection', () => {
  const first=run("loadFloor(5,604);JSON.stringify(world.traps.map(t=>[t.x,t.y,t.kind,t.rewardWeapon]))");
  assert.equal(run("loadFloor(5,604);JSON.stringify(world.traps.map(t=>[t.x,t.y,t.kind,t.rewardWeapon]))"),first);
  let rewards=0,total=0;
  for(let seed=1;seed<=100;seed++){
    const result=run(`loadFloor(5,${seed});[world.traps.filter(t=>t.rewardWeapon).length,world.traps.length]`);
    rewards+=result[0];total+=result[1];
  }
  assert.ok(rewards/total>.04&&rewards/total<.12,`${rewards}/${total}`);
  run("loadFloor(5,604);enemies=[];props=[];loot=[];player.inv=0;world.torches.forEach(t=>t.lit=true);var hoardWeapon=withRealmDepth(makeWeapon);var normalPower=hoardWeapon.damage;hoardWeapon.damage+=5;var hoard={x:player.x+45,y:player.y,kind:'trapdoor',rewardWeapon:hoardWeapon,inspect:0,active:0};world.traps=[hoard];var beforeHoardHP=player.hp;var beforeHoardDepth=depth;updateTraps(1.9,false)");
  assert.equal(run('loot.length'),0);
  run('updateTraps(.11,false);updateTraps(2,false)');
  assert.equal(run('loot.length===1&&loot[0].weapon===hoardWeapon&&loot[0].weapon.damage===normalPower+5'),true);
  assert.equal(run('hoard.triggered&&hoard.revealed&&hoard.active===0&&!hoard.rewardWeapon'),true);
  assert.equal(run('player.hp===beforeHoardHP&&depth===beforeHoardDepth&&!triggerTrap(hoard,true)&&!worldTargets().includes(hoard)'),true);
  run("selectedWorldItem=loot[0];interact()");
  assert.equal(run('player.weapon===hoardWeapon'),true);
  run("loadFloor(16,604);enemies=[];props=[];loot=[];player.inv=0;var forfeited={x:player.x,y:player.y,kind:'explosion',rewardWeapon:hoardWeapon,inspect:0,active:0};world.traps=[forfeited];updateTraps(.04,true)");
  assert.equal(run('forfeited.triggered&&loot.length===0&&depth===16'),true);
  run('begin()');
});
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
  assert.equal(api.MAX_FLOOR,16);
  for(let chapter=1;chapter<=5;chapter++){
    const themes=new Set(),rosters=[];
    for(const floor of [chapter*2-1,chapter*2]){
      for(let seed=0;seed<12;seed++){
        const generated=api.generate(seed,chapter);themes.add(generated.theme.id);
        run(`loadFloor(${floor},${seed+100})`);
        const snapshot=api.snapshot(),present=new Set(snapshot.enemyTypes);
        assert.equal(snapshot.realm,chapter);
        for(const type of api.chapterRosters[chapter-1])assert.ok(present.has(type),`missing ${type} on floor ${floor}`);
        if(floor===8)assert.ok(present.has('dragon'));
        else assert.ok(!present.has('dragon'),`dragon appeared outside its eighth-floor boss cycle`);
        for(const type of present)assert.ok(type==='cave_spider'||type==='dragon'&&floor===8||api.chapterRosters[chapter-1].includes(type),`wrong creature ${type}`);
        rosters.push([...present].sort().join(','));
      }
    }
    assert.deepEqual([...themes],[api.chapterThemes[chapter-1].id]);
    assert.equal(new Set(rosters).size,chapter===4?2:1);
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
check('spider webs, wizard fire and lightning are telegraphed attacks with real effects', () => {
  for (const [type, status] of [['cave_spider','root'],['cinder_wizard','burn']]) {
    run(`loadFloor(1,42);player.x=world.start.x;player.y=world.start.y;player.hp=120;player.inv=0;player.poison=player.burn=0;shots=[];enemies=[makeEnemy('${type}',{x:player.x+120,y:player.y})];enemies[0].cool=0;update(.01)`);
    assert.ok(run('enemies[0].wind>0'),`${type} has no telegraph`);
    assert.ok(run("enemies[0].attackTarget&&Math.abs(enemies[0].attackTarget.x-player.x)<.01"),`${type} did not lock a target`);
    for(let i=0;i<(type==='cave_spider'?22:30);i++)run('update(.04)');
    if(status==='burn'){
      assert.ok(run("shots.some(s=>s.type==='fire')"),`${type} did not launch its projectile`);
      run("{const s=shots[0];s.x=player.x;s.y=player.y;s.vx=0;s.vy=0;player.inv=0;update(.01)}");
    }else assert.equal(run("shots.some(s=>s.type==='web')"),false,'web should have no travel delay');
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
check('weapon types and wands drop with valid stats and no whips', () => {
  const kinds = new Set();
  for (let i=0;i<200;i++) {
    const w=run('makeWeapon()'); kinds.add(w.kind);
    assert.ok(w.damage>0&&w.range>=68&&w.range<=700&&w.cooldown>=.3&&w.cooldown<=.95);
    run(`heroShots=[];player.weapon=${JSON.stringify(w)};player.cool=0;attack()`);
    assert.equal(run('player.cool'),w.cooldown);
  }
  assert.equal(kinds.size,14);
  assert.equal([...kinds].some(kind=>kind.includes('whip')),false);
});
check('rifles and pistols are ranged for classification, preference, and projectile combat', () => {
  for(const kind of ['rifle','pistol']){
    run(`begin();world.tiles.fill(1);props=[];enemies=[];player.weapon={...weaponTypes.${kind},kind:'${kind}',name:'Test gun',damage:30};player.cool=0;gearPreferences.prefer='ranged';var gunUpgrade={type:'weapon',weapon:{...player.weapon,damage:31}};heroShots=[]`);
    assert.equal(run(`rangedKinds.includes('${kind}')&&betterAutoGear(gunUpgrade)`),true);
    run("gearPreferences.prefer='melee'");
    assert.equal(run('betterAutoGear(gunUpgrade)'),false);
    run('attack()');
    assert.equal(run(`heroShots.length===1&&heroShots[0].kind==='${kind}'`),true);
  }
  run('begin()');
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
  run('loadFloor(4,42);state="playing";keys.clear();player.dash=0;world.quake.next=.1;for(let i=0;i<1000;i++)update(.04)');
  assert.equal(run('idleThreat.elapsed'),0);
  assert.equal(run('idleThreat.markers.length'),0);
  assert.ok(run('!enemies.some(e=>e.idleRisen)&&world.quake.elapsed===0&&world.cracks.length===0'));
});
check('room identities, graves casks racks webs eggs and ruins preserve floor geometry and safe passages', () => {
  for(let floor=1;floor<=16;floor++){
    run(`loadFloor(${floor},42)`);
    assert.equal(run('new Set(world.rooms.slice(1,11).map(r=>r.kind)).size'),8);
    assert.ok(run('roomKinds.every(kind=>world.rooms.some(r=>r.kind===kind.id&&r.decor.length===6))'));
    assert.ok(run('world.rooms[0].decor.length===0&&world.rooms[11].decor.length===0'));
    assert.ok(run('world.webs.length>=3&&world.webs.every(w=>free(w.x,w.y,18)&&world.rooms.some(r=>r.kind==="spider"&&pointInRoom(w,r)))'));
    const original=sandbox.window.emberkeep.generate(42,Math.min(5,Math.ceil(floor/2)));
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
check('earthquakes begin on floor 3, not floors 1 or 2 even outside the sanctuary', () => {
  for(const floor of [1,2]){
    run(`loadFloor(${floor},42);state="playing";player.x=world.end.x;player.y=world.end.y;world.quake.next=.01;updateEarthquakes(200,player)`);
    assert.ok(run('!inMerchantSanctuary()&&world.quake.elapsed===0&&world.quake.warning===0&&world.cracks.length===0'));
  }
});
check('eighth-floor bosses spawn once in reachable final rooms on seeded layouts', () => {
  for(const floor of [8,16])for(let seed=0;seed<50;seed++){
    run(`loadFloor(${floor},${seed})`);
    assert.ok(run(`(() => {
      const bosses=enemies.filter(e=>e.boss),boss=bosses[0];
      if(bosses.length!==1||distance(boss,world.end)!==0||!pointInRoom(boss,world.rooms.at(-1))||!free(boss.x,boss.y,boss.radius))return false;
      const start=Math.floor(world.start.y/T)*W+Math.floor(world.start.x/T),goal=Math.floor(boss.y/T)*W+Math.floor(boss.x/T);
      const visited=new Set([start]),queue=[start];
      for(let i=0;i<queue.length;i++)for(const n of [queue[i]-1,queue[i]+1,queue[i]-W,queue[i]+W]){
        if(n<0||n>=W*H||visited.has(n)||!free((n%W+.5)*T,(Math.floor(n/W)+.5)*T,player.radius||12))continue;
        visited.add(n);queue.push(n);
      }
      return visited.has(goal);
    })()`),`boss unreachable on floor ${floor}, seed ${seed}`);
  }
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
  assert.equal(run('fallToFloor(17,"invalid")'),false);
  run('loadFloor(15,42);state="playing";world.cracks=[{x:player.x,y:player.y,grace:0}];updateEarthquakes(.04,player)');
  assert.equal(run('depth'),16);
  assert.equal(run('enemies.filter(e=>e.boss).length'),1);
  run('world.quake.next=.01;updateEarthquakes(200,player)');
  assert.equal(run('world.quake.warning'),0,'boss floor started a quake warning');
  assert.equal(run('world.quake.pending'),null,'boss floor advertised a descending fissure');
  run('updateEarthquakes(3,player)');
  assert.equal(run('world.quake.warning'),0);
  assert.equal(run('world.quake.elapsed'),0);
  run('world.quake.next=.01;updateEarthquakes(.02,player)');
  assert.equal(run('world.quake.warning'),0,'boss floor triggered a bypass fissure');
  assert.equal(run('depth'),16);assert.equal(run('world.cracks.length'),0);
  assert.ok(run('state==="playing"'),'a crack bypassed the boss');
});
check('merchant schedule, safe room and weapon armor potion transactions work on floors 2 and 4', () => {
  for(const floor of [1,3,5,7,9,11,13,15,16]){
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
check('stairs advance the sixteen-floor cycle and restore health after each descent', () => {
  run('begin()');
  for (let d = 2; d <= 16; d++) {
    run('if(depth%8===0){bossDefeated=true;world.end.sealed=false}');
    run('player.x=world.end.x;player.y=world.end.y;props=[];loot=[];player.hp=10;interact()');
    assert.equal(run('depth'), d); assert.equal(run('player.hp'), run('player.max'));
    assert.equal(run('world.theme.id'),run(`chapterThemes[Math.min(4,${Math.ceil(d/2)-1})].id`));
  }
  assert.equal(run('enemies.filter(e=>e.boss).length'),1);
  run('bossDefeated=true;player.x=world.end.x;player.y=world.end.y;interact()');
  assert.equal(run('depth'),1,'cleared final boss did not continue into a new cycle');
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
check('boss celebration, death, restart and pause transitions', () => {
  run('hurtEnemy(enemies[0],10000)'); assert.equal(run('state'), 'playing'); assert.ok(run('player.gold>=500'));
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
check('trapdoors respect the next eighth-floor boss gate and never bypass it', () => {
  for(let floor=1;floor<=15;floor++)for(let seed=0;seed<12;seed++){
    if(floor===8)continue;
    run(`loadFloor(${floor},${seed});state='playing';triggerTrap({x:player.x,y:player.y,kind:'trapdoor'})`);
    assert.equal(run('depth'),floor+1);
    if(run('depth')===8||run('depth')===16)assert.equal(run('enemies.some(e=>e.boss)'),true);
  }
  run("loadFloor(8,60);state='playing';triggerTrap({x:player.x,y:player.y,kind:'trapdoor'})");
  assert.equal(run('depth'),8,'trapdoor bypassed the active boss');
  for(let floor=16;floor<=16;floor++){
    run(`loadFloor(${floor},60)`);
    assert.equal(run("world.traps.some(t=>t.kind==='trapdoor')"),false);
  }
});
check('crossfire traps fire eight arrows, deal one half-health volley, and can be dodged', () => {
  run("loadFloor(1,604);world.tiles.fill(1);enemies=[];props=[];state='playing';player.armor=player.boots=player.gloves=player.helmet=null;player.max=120;player.hp=120;player.inv=0;var room=world.rooms[1];player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;var crossTrap={x:player.x,y:player.y,kind:'crossfire',room:world.rooms.indexOf(room),revealed:false,triggered:false};world.traps=[crossTrap];triggerTrap(crossTrap,true)");
  assert.equal(run("world.crossfireShots.length===8&&new Set(world.crossfireShots.map(a=>a.style)).size===4"),true);
  run('updateCrossfire(.8)');
  assert.equal(run('player.hp===60&&crossTrap.hit&&world.crossfireShots.length===0'),true);
  run("player.hp=120;player.inv=1;player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;crossTrap={x:player.x,y:player.y,kind:'crossfire',room:world.rooms.indexOf(room),revealed:false,triggered:false};world.traps=[crossTrap];triggerTrap(crossTrap,true);updateCrossfire(.8)");
  assert.equal(run('player.hp===120&&!crossTrap.hit'),true);
});
check('pedestal inspection gets one 10 percent disarm attempt, otherwise releases the boulder', () => {
  for(const [roll,success] of [[.099,true],[.1,false]]){
    run(`begin();world.tiles.fill(1);world.merchant=null;world.traps=[];world.webs=[];world.torches=[];enemies=[];props=[];loot=[];keys.clear();var room=world.rooms[1];player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;var relic={x:player.x+45,y:player.y,relic:'moon statue',opened:false};world.pedestals=[relic];rng=()=>${roll};update(2)`);
    assert.equal(run('!!relic.disarmed'),success);
    assert.equal(run('!!world.boulder'),!success);
    run("saveRun();savedRun=null;restoreSavedRun();relic=world.pedestals[0]");
    assert.equal(run('!!relic.disarmed'),success);
    assert.equal(run('!!world.boulder'),!success);
    if(success){run("collectPedestal(relic)");assert.equal(run('relic.opened&&!world.boulder'),true)}
    else{run("world.boulder=null;collectPedestal(relic)");assert.equal(run('relic.opened&&!world.boulder'),true,'failure must not release twice')}
  }
  run("begin();world.boulder=null;var room=world.rooms[1];var relic={x:(room.x+room.w/2)*T,y:(room.y+room.h/2)*T,relic:'moon statue',opened:false};collectPedestal(relic)");
  assert.equal(run("world.boulder.x===(room.x+room.w-.5)*T&&world.boulder.direction===-1&&world.boulder.hp===10"),true);
});
check('boulder rolls left at constant speed, tracks vertically, and crumbles at walls and room edges', () => {
  run("begin();world.tiles.fill(1);world.rooms[1]={x:10,y:10,w:20,h:20};var room=world.rooms[1];player.x=11*T;player.y=20*T;player.inv=100;world.boulder={x:25*T,y:15*T,room:1,hp:10,max:10,radius:25,age:0};var start={...world.boulder};updateBoulder(1)");
  assert.ok(run("Math.abs(world.boulder.x-(start.x-145))<.001&&Math.abs(world.boulder.y-(start.y+85))<.001&&world.boulder.radius===25"));
  run("var previousX=world.boulder.x;player.y=world.boulder.y;updateBoulder(.5)");
  assert.ok(run("Math.abs(world.boulder.x-(previousX-72.5))<.001"));
  run("world.boulder={x:(room.x+.1)*T,y:15*T,room:1,hp:10,max:10};updateBoulder(.2)");
  assert.equal(run('world.boulder'),null);
  run("world.boulder={x:20*T+2,y:15*T,room:1,hp:10,max:10};world.tiles[15*W+19]=0;updateBoulder(.2)");
  assert.equal(run('world.boulder'),null);
});
check('boulder impact removes 90 percent of current health and dodge lets it continue', () => {
  run("begin();world.tiles.fill(1);world.rooms[1]={x:10,y:10,w:20,h:20};player.x=15*T;player.y=15*T;player.hp=60;player.inv=0;player.armor={reduction:.25};world.boulder={x:player.x+60,y:player.y,room:1,hp:10,max:10};updateBoulder(.3)");
  assert.ok(run('Math.abs(player.hp-6)<.00001&&world.boulder===null'));
  run("player.hp=60;player.inv=1;world.boulder={x:player.x+60,y:player.y,room:1,hp:10,max:10};updateBoulder(.5)");
  assert.equal(run('player.hp===60&&world.boulder!==null&&world.boulder.x<player.x'),true);
});
check('boulder withstands exactly five melee or ten ranged hits regardless of damage', () => {
  for(const kind of ['sword','bow','wand-fireball','wand-fire','wand-light']){
    const melee=kind==='sword',hits=melee?5:10;
    run(`begin();world.tiles.fill(1);world.rooms[1]={x:10,y:10,w:20,h:20};player.x=15*T;player.y=15*T;player.angle=0;enemies=[];props=[];world.torches=[];world.boulder={x:player.x+40,y:player.y,room:1,hp:10,max:10,radius:25};player.weapon=${kind.startsWith('wand-')?`{kind:'wand',effect:'${kind.slice(5)}',power:1,name:'wand',range:300,color:'#fff'}`:`{...weaponTypes.${kind},kind:'${kind}',damage:999,range:300,color:'#fff'}`}`);
    for(let i=0;i<hits;i++){
      run("player.cool=0;heroShots=[];attack();updateHeroShots(.2)");
      assert.equal(run('world.boulder===null'),i===hits-1,`${kind} hit ${i+1}`);
    }
  }
});
check('enemy traps, legacy boulder state and their references survive save and resume', () => {
  run("begin();loadFloor(1,604);world.tiles.fill(1);world.traps=[{x:player.x+80,y:player.y,kind:'fire',revealed:true,triggered:false,inspect:0,active:0}];world.boulder={x:player.x-300,y:player.y,axis:'x',direction:1,age:7,hp:43,max:100,radius:39.58};enemies=[makeEnemy('bone_archer',{x:player.x+300,y:player.y})];shots=[];shoot(enemies[0],0,200,'ranged');shots[0].remaining=30;saveRun();state='title';savedRun=null");
  assert.equal(run('restoreSavedRun()'),true);
  assert.equal(run("world.traps[0].revealed&&!world.traps[0].triggered&&world.boulder.hp===5&&world.boulder.max===10&&world.boulder.direction===-1&&world.boulder.age===7&&shots[0].remaining===30&&shots[0].owner===enemies[0]"),true);
  run("var savedTrapEnemy=makeEnemy('slime',world.traps[0]);savedTrapEnemy.hp=300;enemies=[savedTrapEnemy];updateTraps(.01,false)");
  assert.equal(run("world.traps[0].targetFaction==='enemy'&&savedTrapEnemy.burn>0"),true);
});
check('hidden hazards ignore mobs, disarmed hazards never harm the knight, and disarmed pits kill mobs', () => {
  for(const kind of ['poison','fire','explosion','quicksand','trapdoor','bugs','bats','crossfire']){
    run(`begin();loadFloor(1,604);world.tiles.fill(1);props=[];player.inv=0;player.hp=120;player.x+=100;var factionTrap={x:player.x,y:player.y,kind:'${kind}',room:1,revealed:false,triggered:false};var mobVictim=makeEnemy('slime',factionTrap);mobVictim.hp=mobVictim.max=300;enemies=[mobVictim];world.traps=[factionTrap];triggerTrap(factionTrap);`);
    assert.equal(run("mobVictim.hp===300&&!mobVictim.poison&&!mobVictim.burn&&!mobVictim.slow"),true,kind+' hidden');
    run(`loadFloor(1,604);world.tiles.fill(1);props=[];player.inv=0;player.hp=120;player.poison=player.burn=player.slow=0;var factionTrap={x:player.x,y:player.y,kind:'${kind}',room:1,revealed:true,triggered:false};var mobVictim=makeEnemy('slime',factionTrap);mobVictim.hp=mobVictim.max=300;enemies=[mobVictim];world.traps=[factionTrap];updateTraps(.01,false);`);
    assert.equal(run("factionTrap.triggered&&player.hp===120&&!player.poison&&!player.burn&&!player.slow"),true,kind+' disarmed');
    if(kind==='trapdoor')assert.equal(run('mobVictim.hp'),0);
    if(kind==='poison')assert.ok(run('mobVictim.poison>0'));
    if(kind==='fire')assert.ok(run('mobVictim.burn>0'));
    if(kind==='quicksand')assert.ok(run('mobVictim.slow>0'));
  }
});
check('spider webs strike within 0.1 seconds only in the shown cone', () => {
  run("begin();loadFloor(1,604);world.tiles.fill(1);props=[];world.traps=[];player.root=0;player.inv=0;var spider=makeEnemy('cave_spider',{x:player.x+120,y:player.y});spider.cool=0;enemies=[spider];update(.01)");
  assert.ok(run('spider.wind<=.08'));
  run("update(.09)");assert.equal(run('player.root>0'),true);
  run("player.root=0;spider.attackAngle=0;strikeWeb(spider)");assert.equal(run('player.root'),0);
  run("spider.attackAngle=Math.PI;var blockingAlly=makeEnemy('slime',{x:player.x+60,y:player.y});enemies.push(blockingAlly);strikeWeb(spider)");
  assert.equal(run('player.root>0&&blockingAlly.hp===blockingAlly.max'),true);
});
check('crossfire respects the disarmed trap faction and hits each monster once', () => {
  run("begin();loadFloor(1,604);world.tiles.fill(1);props=[];world.merchant=null;var testRoom=world.rooms[1];player.x=(testRoom.x+testRoom.w/2)*T;player.y=(testRoom.y+testRoom.h/2)*T;player.hp=120;player.inv=0;var trap={x:player.x,y:player.y,kind:'crossfire',room:1,revealed:true,triggered:false};var caught=makeEnemy('slime',trap);caught.hp=caught.max=200;enemies=[caught];world.traps=[trap];updateTraps(.01,false);updateCrossfire(.8)");
  assert.equal(run("caught.hp===100&&player.hp===120&&trap.victims.has(caught)"),true);
});
check('enemy projectiles expire at the displayed cone radius', () => {
  for(const kind of ['cinder_wizard','bone_archer','dragon']){
    run(`begin();loadFloor(1,604);world.tiles.fill(1);world.traps=[];props=[];player.x=2000;player.y=1500;var caster=makeEnemy('${kind}',{x:500,y:500});caster.reach=150;caster.speed=0;caster.cool=1000;enemies=[caster];shots=[];shoot(caster,0,200,'fire');var limited=shots[0];for(let i=0;i<100;i++)baseUpdate(.04)`);
    assert.ok(run("Math.abs(limited.x-(500+("+ (kind==='dragon'?330:150) +")))<1e-7"));
    assert.equal(run('shots.length'),0);
  }
});
check('room lighting, reachable torches and hazard placement preserve safe entrances and finale', () => {
  const kinds=new Set();
  for(let floor=1;floor<=16;floor++)for(let seed=0;seed<20;seed++){
    run(`loadFloor(${floor},${seed})`);
    assert.equal(run("world.rooms[0].lighting==='lit'&&world.rooms[11].lighting==='lit'"),true);
    assert.equal(run("world.rooms.some(r=>r.lighting==='dark')&&world.rooms.some(r=>r.lighting==='partial')"),true);
    assert.equal(run('world.torches.every(t=>free(t.x,t.y,12))'),true);
    assert.equal(run('world.traps.every(t=>!pointInRoom(t,world.rooms[0])&&distance(t,world.end)>90&&free(t.x,t.y,12))'),true);
    for(const kind of run('world.traps.map(t=>t.kind)'))kinds.add(kind);
  }
  assert.equal(kinds.size,15);
  assert.ok(kinds.has('bedbugs'));
  run("loadFloor(1,604);enemies=[];props=[];loot=[];const torch=world.torches.find(t=>!t.lit);player.x=torch.x;player.y=torch.y+35;world.end.x=2500;world.end.y=1900");
  const before=run('lightAt({x:torch.x+70,y:torch.y+70})');
  run('interact()');assert.equal(run('torch.lit'),false);
  run('player.angle=-Math.PI/2;player.cool=0;player.weapon={...weaponTypes.sword,kind:"sword"};attack();update(.01)');assert.equal(run('torch.lit'),true);
  assert.ok(run('lightAt({x:torch.x+70,y:torch.y+70})')>before);
  run('player.cool=0;attack()');assert.equal(run('torch.lit'),false);
  run("loot=[{x:player.x,y:player.y,type:'armor',armor:{name:'Priority mail',kind:'chain',reduction:.2}}];interact()");
  assert.equal(run('player.armor.name'),'Priority mail');assert.equal(run('torch.lit'),false);
  run('player.x=world.start.x;player.y=world.start.y;var roomIndex=3;var samplePoint={x:world.torches[roomIndex*4].x+15,y:world.torches[roomIndex*4].y+15};world.torches.filter(t=>t.room===roomIndex).forEach(t=>t.lit=true)');
  const allLit=run('lightAt(samplePoint)');
  run('world.torches.filter(t=>t.room===roomIndex).forEach(t=>t.lit=false)');
  assert.ok(allLit-run('lightAt(samplePoint)')>.5,'extinguishing a previously lit room must darken it');
});
check('ranged projectiles hit monsters and containers, stop at stone, and do not melee at distance', () => {
  for(const kind of ['bow','crossbow','javelin','boomerang']){
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
    run(`loot=[{x:player.x,y:player.y,type:'armor',armor:{...makeArmor('${slot}'),kind:'chain',slot:'${slot}',name:'First ${slot}',reduction:.1}}];interact()`);
    assert.equal(run(`player.${slot}.name`),'First '+slot);
  }
  assert.equal(run('reduction()'),.4);
  run("loot=[{x:player.x,y:player.y,type:'armor',armor:{...makeArmor('boots'),kind:'chain',slot:'boots',name:'New boots',reduction:.12}}];interact()");
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
check('glints fully disappear between shines and require radial torchlight, never the player halo', () => {
  run('loadFloor(1,604);enemies=[];world.torches.forEach(t=>t.lit=false);var r=world.rooms[1];var glintTrap={x:(r.x+2)*T,y:(r.y+2)*T};player.x=glintTrap.x;player.y=glintTrap.y');
  assert.ok(run('lightAt(glintTrap)')>.1,'personal navigation halo missing');
  for(let i=0;i<72;i++)assert.equal(run(`trapGlint(glintTrap,${i/20})`),0);
  run('roomTorch(glintTrap).lit=true');
  const values=Array.from({length:72},(_,i)=>run(`trapGlint(glintTrap,${i/20})`));
  assert.ok(values.some(v=>v>.9));assert.ok(values.filter(v=>v===0).length>=50);
  run('world.torches.forEach(t=>t.lit=false);var farTorch=world.torches.find(t=>distance(t,glintTrap)>torchRadius(t)*2);farTorch.lit=true');
  assert.equal(run('trapGlint(glintTrap,1)'),0);
});
check('circular torchlight fades smoothly, combines naturally, and scales with room area and torch count', () => {
  run('loadFloor(1,604);enemies=[];player.x=world.start.x;player.y=world.start.y;var lightRoom=world.rooms[1];var sconces=world.torches.filter(t=>t.room===1);world.torches.forEach(t=>t.lit=false)');
  let prior=0;
  for(let n=0;n<=4;n++){
    run(`sconces.forEach((t,i)=>t.lit=i<${n})`);
    const fraction=run(`(()=>{let lit=0;for(let y=0;y<40;y++)for(let x=0;x<40;x++)if(torchIllumination({x:(lightRoom.x+(x+.5)/40*lightRoom.w)*T,y:(lightRoom.y+(y+.5)/40*lightRoom.h)*T})>.2)lit++;return lit/1600})()`);
    if(n===0)assert.equal(fraction,0);
    else assert.ok(fraction>prior&&fraction<=Math.min(1,n*.4),`coverage ${n}: ${fraction}`);
    if(n===4)assert.ok(fraction>.8);
    prior=fraction;
  }
  run('world.tiles.fill(1);world.torches.forEach(t=>{t.lit=false;torchVisibilityCache.delete(t)});var roundTorch=sconces[0];roundTorch.lit=true;var radius=torchRadius(roundTorch)');
  for(const fraction of [.1,.3,.5,.75,.99,1,1.1]){
    const axis=run(`torchIllumination({x:roundTorch.x+radius*${fraction},y:roundTorch.y})`);
    const diagonal=run(`torchIllumination({x:roundTorch.x+radius*${fraction}/Math.SQRT2,y:roundTorch.y+radius*${fraction}/Math.SQRT2})`);
    assert.ok(Math.abs(axis-diagonal)<1e-12,'light is not circular');
    assert.ok(Math.abs(axis-run(`radialLight(${fraction})`))<1e-12,'render and gameplay falloff disagree');
  }
  for(const edge of [.18,.45,.7,1])assert.ok(run(`Math.abs(radialLight(${edge}-.00001)-radialLight(${edge}+.00001))`)<.001,'falloff jumps at a gradient stop');
  assert.equal(run('radialLight(1.01)'),0);
  run('var outside={x:roundTorch.x+radius*1.01,y:roundTorch.y};player.x=outside.x;player.y=outside.y;clock=((.45-outside.x*.013-outside.y*.007)%3.6+3.6)%3.6');
  assert.ok(run('lightAt(outside)')>.4);
  assert.equal(run('trapGlint(outside)'),0,'personal halo exposed an unlit trap');
  assert.ok(run('!lightStops.some(([offset])=>offset<0||offset>1)'));
});
check('hidden-trap prompts disappear with the glint unless inspection is already underway', () => {
  run("loadFloor(1,604);props=[];loot=[];enemies=[];world.torches.forEach(t=>t.lit=false);var hintTrap={x:player.x+45,y:player.y,kind:'fire',inspect:0};world.traps=[hintTrap];roomTorch(hintTrap).lit=true;clock=((.45-hintTrap.x*.013-hintTrap.y*.007)%3.6+3.6)%3.6");
  assert.match(run('interactionPrompt(null)'),/Floor glint/);
  run('clock+=1.5');assert.equal(run('interactionPrompt(null)'),'');
  run('hintTrap.inspect=.8');assert.match(run('interactionPrompt(null)'),/Inspecting floor glint: 40%/);
  run('roomTorch(hintTrap).lit=false');assert.equal(run('interactionPrompt(null)'),'');
});
check('corridors retain soft ambient light and stone walls block radial light and hidden glints', () => {
  run("loadFloor(1,604);world.torches.forEach(t=>t.lit=false);prepareAmbient();var corridorIndex=corridorTiles.findIndex(Boolean);var corridorPoint={x:(corridorIndex%W+.5)*T,y:(Math.floor(corridorIndex/W)+.5)*T}");
  assert.ok(Math.abs(run('ambientAt(corridorPoint)')-.42)<1e-12);
  assert.ok(run('world.rooms.some(r=>ambientAt({x:(r.x+r.w/2)*T,y:(r.y+r.h/2)*T})<.1)'));
  run("world.tiles.fill(1);world.rooms=[{x:3,y:3,w:12,h:12}];world.torches=[{x:7.5*T,y:7.5*T,room:0,lit:true}];var occludedTorch=world.torches[0];for(let y=0;y<H;y++)world.tiles[y*W+9]=0;var behindWall={x:10.5*T,y:7.5*T}");
  assert.ok(run('radialLight(distance(behindWall,occludedTorch)/torchRadius(occludedTorch))')>.2);
  assert.equal(run('torchIllumination(behindWall)'),0);
  assert.equal(run('trapGlint(behindWall,((.45-behindWall.x*.013-behindWall.y*.007)%3.6+3.6)%3.6)'),0);
  assert.ok(run('torchIllumination({x:8.5*T,y:7.5*T})')>.5);
  run("loadFloor(1,604)");
});
check('disarmed traps remain safe and trigger when a monster steps on them', () => {
  run("loadFloor(1,604);state='playing';enemies=[];props=[];loot=[];world.traps=[{x:player.x+45,y:player.y,kind:'fire',revealed:true,active:0}];player.hp=120;player.inv=0;world.end.x=2500;world.end.y=1900");
  assert.equal(run('nearby()'),run('world.traps[0]'));
  run('player.x=world.traps[0].x;updateTraps(.1,false)');
  assert.equal(run('player.hp'),120);assert.ok(!run('world.traps[0].triggered'));
  run('player.x-=45;updateTraps(2,false)');
  assert.ok(!run('world.traps[0].triggered'));
  run("enemies=[makeEnemy('slime',{x:world.traps[0].x,y:world.traps[0].y})];var victim=enemies[0];updateTraps(.1,false)");
  assert.ok(run('victim.burn>0'));const hp=run('victim.hp');
  run('updateTraps(.5,false)');assert.ok(run('victim.hp')<hp,'monster did not burn over time');
  run('updateTraps(6,false);var oldhp=player.hp;player.x=world.traps[0].x;updateTraps(.1,false)');
  assert.equal(run('player.hp'),run('oldhp'),'spent trap kept damaging entrants');
});
check('disarmed trap swarms attack monsters but not the knight; pits remove monsters', () => {
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
      assert.equal(run('player.hp'),120);
    }
  }
});
check('every projectile stops on the first collider; one additional shot clears debris before shots pass', () => {
  for(const kind of ['bow','crossbow','javelin','knife','throwing_axe','boomerang']){
    for(const prop of ['crate','barrel']){
      run(`loadFloor(1,604);state='playing';world.traps=[];player.level=1;player.angle=0;player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:25,color:'#ddd'};props=[{x:player.x+65,y:player.y,type:'${prop}',hp:60,open:false}];enemies=[makeEnemy('slime',{x:player.x+110,y:player.y})];var behind=enemies[0];behind.hp=300;player.cool=0;attack();updateHeroShots(.25)`);
      assert.equal(run('props[0].hp'),33);assert.equal(run('behind.hp'),300);
      run('heroShots=[];props[0].hp=1;player.cool=0;attack();updateHeroShots(.25)');
      assert.equal(run('props[0].broken'),true);assert.equal(run('behind.hp'),300);
      run('heroShots=[];player.cool=0;attack();updateHeroShots(.35)');
      assert.equal(run('props[0].destroyed'),true);assert.equal(run('behind.hp'),300);
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
check('overlapping gear cycles without selecting the underlying torch', () => {
  run(`loadFloor(1,604);state='playing';enemies=[];props=[];world.traps=[];world.torches=[];
    var overlap={x:player.x+40,y:player.y}, sword={...overlap,type:'weapon',weapon:makeWeapon()}, mail={...overlap,type:'armor',armor:makeArmor()}, sconce={...overlap,type:'torch',lit:false};
    loot=[sword,mail];world.torches=[sconce];world.seen.fill(1);
    var selectEvent={clientX:(overlap.x-camera.x)/vw*1000,clientY:(overlap.y-camera.y)/vh*700,preventDefault(){}};
    var oldWeapon=player.weapon;var oldCool=player.cool;var oldAngle=player.angle;mouse.down=true`);
  assert.equal(run("selectWorldPointer(selectEvent)"),true);
  assert.equal(run("selectedWorldItem===sword&&nearby()===sword"),true);
  assert.equal(run("selectionChoices.length"),2);
  run("selectWorldPointer(selectEvent)");assert.equal(run("selectedWorldItem===mail"),true);
  run("selectWorldPointer(selectEvent)");assert.equal(run("selectedWorldItem===sword"),true);
  assert.equal(run("player.weapon===oldWeapon&&player.cool===oldCool&&player.angle===oldAngle&&mouse.down&&!sconce.lit"),true);
  run('mouse.down=false');
  run("interact()");
  assert.equal(run("player.weapon===sword.weapon&&!loot.includes(sword)"),true);
  assert.equal(run("selectedWorldItem"),null);
  assert.ok(elements.get('selectionChoices').children.length>=1);
});
check('torches have no selection or nearby use action, while weapon hits toggle without fire', () => {
  run("loadFloor(1,604);state='playing';props=[];world.traps=[];var dedicatedTorch={x:player.x+40,y:player.y,type:'torch',lit:false};world.torches=[dedicatedTorch];loot=[{x:dedicatedTorch.x,y:dedicatedTorch.y,type:'armor',armor:makeArmor()}];selectedWorldItem=loot[0]");
  run("interact()");
  assert.equal(run("dedicatedTorch.lit"),false);
  assert.equal(run("worldTargets().includes(dedicatedTorch)"),false);
  run("loot=[];selectedWorldItem=null;interact()");
  assert.equal(run("nearby()"),null);
  run("player.angle=0;player.cool=0;player.weapon={...weaponTypes.sword,kind:'sword'};attack()");
  assert.equal(run("dedicatedTorch.lit"),true);
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
check('decor is attack-only, absent from selection nearby Use and overlap choices', () => {
  run(`loadFloor(1,604);state='playing';enemies=[];loot=[];world.traps=[];world.torches=[];
    var obstacle={x:player.x+40,y:player.y,type:'decor',label:'Overgrown rubble',hp:24,open:false};
    props=[obstacle];selectedWorldItem=obstacle;selectionChoices=[obstacle];refreshSelectionPanel();
    var obstacleEvent={clientX:(obstacle.x-camera.x)/vw*1000,clientY:(obstacle.y-camera.y)/vh*700,preventDefault(){}};
    var obstacleCool=player.cool;interact();`);
  assert.ok(run('!worldTargets().includes(obstacle)&&!isWorldTarget(obstacle)&&selectedWorldItem===null&&selectionChoices.length===0&&nearby()!==obstacle'));
  assert.equal(run('selectWorldPointer(obstacleEvent)'),false);
  assert.ok(run('obstacle.hp===24&&!obstacle.open&&player.cool===obstacleCool&&interactionPrompt(nearby())===""'));
  assert.equal(elements.get('selectionPanel').hidden,true);
  run(`var obstacleGear={x:obstacle.x,y:obstacle.y,type:'weapon',weapon:makeWeapon()};loot=[obstacleGear];selectWorldPointer(obstacleEvent)`);
  assert.ok(run('selectedWorldItem===obstacleGear&&selectionChoices.length===1&&!selectionChoices.includes(obstacle)'));
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
