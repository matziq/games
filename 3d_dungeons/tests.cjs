const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const elements = new Map();
const context = new Proxy({createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)}}}, { get: (target, key) => Object.hasOwn(target,key) ? target[key] : key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
function element() {
  return { style: {}, hidden: false, textContent: '', open: false, children: [], getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }), focus() {}, addEventListener() {},
    append(e) { this.children.push(e); }, before() {}, prepend(e) { this.children.unshift(e); }, replaceChildren(...e) { this.children = e; },
    setAttribute() {}, insertAdjacentHTML() {}, classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } },
    showModal() { this.open = true; }, close() { this.open = false; } };
}
const sandbox = { console, Uint8Array, Int16Array, Uint32Array, Math, URLSearchParams, structuredClone,
  crypto: webcrypto, location: { search: '?test' }, requestAnimationFrame() {},
  ResizeObserver: class { observe() {} }, Image: class { complete = true; naturalWidth = 120; },
  document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
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
  run("keyBindings.ammo='v';difficulty='hard';saveRun();keyBindings.ammo='c';difficulty='medium';savedRun=null;restoreSavedRun()");
  assert.equal(run("keyBindings.ammo==='v'&&difficulty==='hard'"),true);
  run("keyBindings.ammo='c';difficulty='medium';begin()");
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
  assert.equal(run("world.scrollZones.at(-1).damage===9&&second.rooted>3"),true);
  run("player.weapon={kind:'wand',effect:'light',power:6,cooldown:.55};player.cool=0;attack()");
  assert.equal(run("world.scrollLights.at(-1).coneAngle===player.angle&&world.scrollLights.at(-1).life>5"),true);
  run("begin()");
});
check('local save restores the current world, shared references, timers and random sequence', () => {
  run("begin();loadFloor(8,604);player.weapon={kind:'wand',effect:'light',power:8,range:300,damage:13};player.gold=4321;player.scrolls.light=7;selectedAmmo='light';player.ammoShared.light=8;world.rooms[1].decor[0].broken=true;world.boss.hp-=23;world.quake.next=Infinity;world.scrollLights.push({x:player.x,y:player.y,life:5});var marker={type:'weapon',weapon:{...player.weapon,name:'Saved marker'},x:player.x,y:player.y};loot.push(marker);selectedWorldItem=marker;heroShots.push({hit:new Set([world.boss])});var beforeSeed=seed;var savedBossHp=world.boss.hp;var savedTiles=Array.from(world.tiles).join('');saveRun()");
  assert.equal(run("decodeRun(window.localStorage.getItem(RUN_SAVE_KEY)).player.gold"),4321);
  run("var expectedRandom=rng();player.gold=0;world.boss.hp=1;state='title';savedRun=null");
  assert.equal(run('restoreSavedRun()'),true);
  assert.equal(run("state==='playing'&&depth===8&&player.gold===4321&&player.scrolls.light===7&&selectedAmmo==='light'&&player.ammo.bow===player.ammo.crossbow&&player.ammo.bow===player.ammoShared"),true);
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
  run("var armor={x:player.x+100,y:player.y,type:'armor',armor:makeArmor('boots')};loot=[armor];state='paused';updateAutoGear()");
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
check('leaving a hatched nest merges only its living brood once and triples parent vitality and damage', () => {
  run("loadFloor(1,604);world.traps=[];var giantNest=world.rooms.find(r=>r.kind==='spider');var parentSpider=giantNest.parent;var parentMax=parentSpider.max,parentDamage=parentSpider.damage;parentSpider.hp/=2;player.x=(giantNest.x+giantNest.w/2)*T;player.y=(giantNest.y+giantNest.h/2)*T;updateNestsAndPits(4,player);var ownBrood=enemies.filter(e=>e.baby);var unrelatedBaby={...ownBrood[0],nest:-1};enemies.push(unrelatedBaby)");
  assert.equal(run('ownBrood.length'),18);
  assert.equal(run('!!parentSpider.giant'),false);
  run('player.x=world.start.x;player.y=world.start.y;updateNestsAndPits(.01,player)');
  assert.equal(run('parentSpider.giant&&parentSpider.max===parentMax*3&&parentSpider.hp===parentMax*1.5&&parentSpider.damage===parentDamage*3'),true);
  assert.equal(run('ownBrood.every(e=>!enemies.includes(e))&&enemies.includes(unrelatedBaby)'),true);
  run('updateNestsAndPits(10,player)');
  assert.equal(run('parentSpider.max'),run('parentMax*3'));
});
check('cleared eggs or killed spiderlings prevent giants; an orphaned surviving brood can form exactly one giant', () => {
  for(const cleared of ['eggs','babies','parent']){
    run("loadFloor(1,604);world.traps=[];var edgeNest=world.rooms.find(r=>r.kind==='spider');var originalParent=edgeNest.parent;player.x=(edgeNest.x+edgeNest.w/2)*T;player.y=(edgeNest.y+edgeNest.h/2)*T");
    if(cleared==='eggs')run('edgeNest.decor.forEach(p=>breakProp(p,999))');
    run('updateNestsAndPits(4,player)');
    if(cleared==='babies')run('enemies.filter(e=>e.baby).forEach(e=>e.hp=0)');
    if(cleared==='parent')run('originalParent.hp=0;enemies=enemies.filter(e=>e!==originalParent)');
    run('player.x=world.start.x;player.y=world.start.y;updateNestsAndPits(.01,player)');
    assert.equal(run('enemies.filter(e=>e.giant).length'),cleared==='parent'?1:0);
    if(cleared==='parent')assert.equal(run('edgeNest.parent!==originalParent&&!enemies.some(e=>e.baby&&e.hp>0)'),true);
  }
});
check('leaving during the egg countdown merges the later hatch rather than duplicating a roaming brood', () => {
  run('loadFloor(1,604);world.traps=[];var delayedNest=world.rooms.find(r=>r.kind==="spider");player.x=(delayedNest.x+delayedNest.w/2)*T;player.y=(delayedNest.y+delayedNest.h/2)*T;updateNestsAndPits(.1,player);player.x=world.start.x;player.y=world.start.y;updateNestsAndPits(4,player);updateNestsAndPits(4,player)');
  assert.equal(run('delayedNest.parent.giant&&!enemies.some(e=>e.baby)&&enemies.filter(e=>e.giant).length===1'),true);
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
check('gold scrolls potions and every ammo pack vacuum at 150 units but gear stays manual', () => {
  run("begin();loadFloor(1,604);player.weapon={kind:'wand',effect:'light',power:1};enemies=[];props=[];world.traps=[];player.dash=0;var pickupX=player.x;var startGold=player.gold;var startPotions=player.potions;var startScroll=player.scrolls.light;var kinds=[{type:'gold',value:17},{type:'scroll',scroll:'light'},{type:'potion'},...['bow','crossbow'].flatMap(ammoKind=>['fire','poison','explosion','light','lightning','web','charm'].map(special=>({type:'ammo',ammoKind,special})))];var nearPickups=kinds.map(k=>({...k,x:player.x+3.75*T,y:player.y}));var farPickups=kinds.map(k=>({...k,x:player.x+3.75*T+.01,y:player.y}));var manualGear=['weapon','armor'].map(type=>({x:player.x+100,y:player.y,type}));loot=[...nearPickups,...farPickups,...manualGear];baseUpdate(.04)");
  assert.equal(run('nearPickups.every(item=>item.x<pickupX+150)&&farPickups.every(item=>item.x===pickupX+150.01)&&manualGear.every(item=>item.x===pickupX+100)'),true);
  run('for(let i=0;i<30;i++){baseUpdate(.04);updateScrolls(.04)}');
  assert.equal(run('player.gold===startGold+17&&player.potions===startPotions+1&&player.scrolls.light===startScroll+1'),true);
  assert.equal(run("['bow','crossbow'].every(k=>['fire','poison','explosion','light','lightning','web','charm'].every(s=>player.ammo[k][s]===10))"),true);
  assert.equal(run('nearPickups.every(item=>!loot.includes(item))&&farPickups.every(item=>loot.includes(item))&&manualGear.every(item=>loot.includes(item))'),true);
});
check('gear and potions flash and expire five seconds sooner; gold remains', () => {
  run("loadFloor(1,604);enemies=[];props=[];world.traps=[];var gear=['weapon','armor'].map(type=>({x:player.x+200,y:player.y,type}));var timedPotion={x:player.x+200,y:player.y,type:'potion'};var permanent=['gold','scroll','ammo'].map(type=>({x:player.x+240,y:player.y,type}));loot=[...gear,timedPotion,...permanent];baseUpdate(4.99)");
  assert.equal(run('lootVisible(timedPotion)&&gear.every(lootVisible)'),true);
  run('baseUpdate(.22)');
  assert.equal(run('!lootVisible(timedPotion)&&gear.every(lootVisible)'),true);
  run('baseUpdate(9.78)');
  assert.equal(run('loot.includes(timedPotion)'),true);
  run('baseUpdate(.02)');
  assert.equal(run('!loot.includes(timedPotion)&&gear.every(item=>loot.includes(item))'),true);
  run('baseUpdate(9.98)');
  assert.equal(run('gear.every(item=>item.age<25&&lootVisible(item))'),true);
  run('baseUpdate(.22)');
  assert.equal(run('gear.every(item=>!lootVisible(item))'),true);
  run('baseUpdate(29.78)');
  assert.equal(run('gear.every(item=>loot.includes(item))'),true);
  run('baseUpdate(.02)');
  assert.equal(run('gear.every(item=>!loot.includes(item))&&permanent.every(item=>loot.includes(item)&&lootVisible(item))'),true);
  run("var timedGear={x:player.x+40,y:player.y,type:'weapon',weapon:makeWeapon(),age:54};loot=[timedGear];selectedWorldItem=timedGear;deleteSelectedGear();baseUpdate(5);undoGearDelete();undoGearDelete()");
  assert.equal(run('loot.length===1&&loot[0]===timedGear&&timedGear.age===54'),true);
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
  run("loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'bow',special:'fire',value:5}];updateScrolls(.01);updateScrolls(.01)");
  assert.equal(run("player.ammo.bow.fire===5&&player.ammoChoice.bow==='fire'"),true);
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
    if(hit==='enemy')assert.ok(run('lightRound.x===600-impactEnemy.radius-5&&impactEnemy.hp<300'));
    if(hit==='crate')assert.ok(run('lightRound.x===580&&props[0].hp<100'));
  }
});
check('melee and projectiles can extinguish and relight a torch exactly once per shot', () => {
  for(const kind of run('Object.keys(weaponTypes)')){
    run(`loadFloor(1,604);world.tiles.fill(1);props=[];enemies=[];player.angle=0;player.cool=0;state='playing';var struck={x:player.x+34,y:player.y,lit:true};world.torches=[struck];player.weapon={...weaponTypes.${kind},kind:'${kind}',damage:20};heroShots=[];attack();if(heroShots.length)updateHeroShots(.2)`);
    assert.equal(run('struck.lit'),false,kind);
    run('heroShots=[];player.cool=0;attack();if(heroShots.length)updateHeroShots(.2)');
    assert.equal(run('struck.lit'),true,kind);
  }
});
check('entering nests hatches only intact eggs once into fast hostile lootless spiderlings', () => {
  run("loadFloor(1,604);enemies=[];world.traps=[];var nest=world.rooms.find(r=>r.kind==='spider');var egg=nest.decor[0];breakProp(egg,999);loot=[];updateNestsAndPits(5,player)");
  assert.equal(run('enemies.length'),0);
  run('player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T;updateNestsAndPits(.01,player)');
  assert.ok(run('nest.hatchTimer>3.9'));
  run('updateNestsAndPits(4,player)');
  assert.equal(run('enemies.filter(e=>e.baby).length'),15);
  assert.equal(run('enemies.every(e=>e.speed===245&&e.hp===10&&e.trapSwarm)'),true);
  run('updateNestsAndPits(9,player)');assert.equal(run('enemies.length'),15);
  run("var baby=enemies[0];var prevDistance=distance(baby,player);baby.emerge=0;updateTraps(.1,false)");
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
  for(let floor=1;floor<=14;floor++)for(let seed=0;seed<12;seed++){
    if(floor===8)continue;
    run(`loadFloor(${floor},${seed});state='playing';triggerTrap({x:player.x,y:player.y,kind:'trapdoor'})`);
    assert.ok(run('depth')>=floor+1&&run('depth')<=Math.min(16,floor+4));
    if(run('depth')===8||run('depth')===16)assert.equal(run('enemies.some(e=>e.boss)'),true);
  }
  run("loadFloor(8,60);state='playing';triggerTrap({x:player.x,y:player.y,kind:'trapdoor'})");
  assert.equal(run('depth'),8,'trapdoor bypassed the active boss');
  for(let floor=15;floor<=16;floor++){
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
check('pedestal boulders pursue laterally, grow, deal up to 90 percent and can be destroyed', () => {
  run("loadFloor(1,604);world.tiles.fill(1);enemies=[];props=[];state='playing';player.armor=player.boots=player.gloves=player.helmet=null;player.max=120;player.hp=120;player.inv=0;var room=world.rooms[1];player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;var relic={x:player.x,y:player.y,room:room.id,relic:'ancient weapon',opened:false};world.pedestals=[relic];var lootCount=loot.length;var firstClaim=collectPedestal(relic);var firstBall={...world.boulder};var repeatClaim=collectPedestal(relic)");
  assert.equal(run("firstClaim&&!repeatClaim&&relic.opened&&loot.length===lootCount+1&&firstBall.hp===100&&firstBall.radius===25"),true);
  run("world.boulder={x:player.x-200,y:player.y-150,axis:'x',direction:1,age:0,hp:100,max:100,radius:25};var initialBall={...world.boulder};updateBoulder(1)");
  assert.equal(run("world.boulder.x===initialBall.x+105&&world.boulder.y===initialBall.y+65&&world.boulder.radius>25&&player.hp===120"),true);
  run("world.boulder={x:player.x-80,y:player.y,axis:'x',direction:1,age:12,hp:100,max:100,radius:50};updateBoulder(.5)");
  assert.ok(run('Math.abs(player.hp-12)<.00001&&world.boulder===null'));
  run("player.hp=120;world.boulder={x:player.x+40,y:player.y,axis:'x',direction:-1,age:1,hp:100,max:100,radius:27};player.angle=0;player.weapon={...weaponTypes.sword,kind:'sword',damage:25};player.cool=0;attack();var ballHP=world.boulder.hp");
  assert.ok(run('ballHP<100'));
  run("player.weapon={...weaponTypes.bow,kind:'bow',damage:100,color:'#ddd'};player.cool=0;heroShots=[];attack();updateHeroShots(.2)");
  assert.equal(run('world.boulder===null'),true);
});
check('enemy traps, boulder growth and their references survive save and resume', () => {
  run("begin();loadFloor(1,604);world.tiles.fill(1);world.traps=[{x:player.x+80,y:player.y,kind:'fire',revealed:true,triggered:false,inspect:0,active:0}];world.boulder={x:player.x-300,y:player.y,axis:'x',direction:1,age:7,hp:43,max:100,radius:39.58};enemies=[makeEnemy('bone_archer',{x:player.x+300,y:player.y})];shots=[];shoot(enemies[0],0,200,'ranged');shots[0].remaining=30;saveRun();state='title';savedRun=null");
  assert.equal(run('restoreSavedRun()'),true);
  assert.equal(run("world.traps[0].revealed&&!world.traps[0].triggered&&world.boulder.hp===43&&world.boulder.age===7&&shots[0].remaining===30&&shots[0].owner===enemies[0]"),true);
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
  assert.equal(kinds.size,8);
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
check('disarmed traps remain safe until a monster steps on them', () => {
  run("loadFloor(1,604);state='playing';enemies=[];props=[];loot=[];world.traps=[{x:player.x+45,y:player.y,kind:'fire',revealed:true,active:0}];player.hp=120;player.inv=0;world.end.x=2500;world.end.y=1900");
  assert.equal(run('nearby()'),null);
  run('player.x=world.traps[0].x;updateTraps(.1,false)');
  assert.equal(run('player.hp'),120);assert.ok(!run('world.traps[0].triggered'));
  run('player.x-=45;interact();updateTraps(2,false)');
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
