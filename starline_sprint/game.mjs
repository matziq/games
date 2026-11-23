export const STEP = 1 / 60;
export const PLAYER_X = 150;
export const PLAYER_SIZE = 28;
export const CEILING = 240;
export const AVATARS = ["nova","orbit","spark","comet"];
const GRAVITY = 1650;
const JUMP_SPEED = 620;
const TYPES = {
  spike: {width: 34, height: 35, teeth: 1},
  twins: {width: 68, height: 39, teeth: 2},
  triplet: {width: 96, height: 42, teeth: 3},
  block: {width: 36, height: 58, teeth: 0},
  diamond: {width: 48, height: 58, teeth: 0},
  hex: {width: 54, height: 50, teeth: 0},
  platform: {width: 150, height: 12, teeth: 0}
};
const designs = [
  {name:"Dawn Circuit", speed:230, colors:["#082139","#0d5371","#ffd86d"], pattern:["spike","spike","twins","spike","block","twins","spike","block","twins","spike","twins","block"], gaps:[370,390,360,400]},
  {name:"Aurora Arcade", speed:250, colors:["#1a143d","#59448a","#7df2d0"], pattern:["spike","twins","block","spike","triplet","twins","block","twins","spike","triplet","block","spike","twins","block","triplet"], gaps:[375,405,360,420]},
  {name:"Starlight Rush", speed:270, colors:["#260f35","#87385b","#ffb5a3"], pattern:["twins","block","triplet","spike","twins","block","triplet","twins","spike","block","triplet","spike","twins","triplet","block","twins","triplet","block"], gaps:[390,420,375,430]}
];
const extra = [
  ["Solar Switch",235,["#1b163d","#755388","#ffe39a"],"spike twins block diamond platform spike twins hex block platform spike diamond",[3,8]],
  ["Neon Causeway",240,["#19103a","#304e84","#6effe2"],"twins platform spike hex block twins platform diamond spike block hex twins",[2,6,9]],
  ["Cosmic Climb",245,["#1c153c","#70517a","#ffa7d4"],"platform spike diamond twins block platform hex spike triplet block platform twins diamond",[4,9]],
  ["Mirage Flip",250,["#2b1539","#924a61","#ffe28a"],"diamond twins platform hex spike triplet platform block diamond twins hex platform block",[2,5,8,11]],
  ["Laser Lagoon",255,["#071f40","#326c83","#90f5db"],"hex platform twins spike block diamond platform triplet hex block twins platform spike",[3,7,10]],
  ["Moonbeam Mile",260,["#151639","#4b5e91","#d0c4ff"],"triplet platform diamond block twins hex platform spike diamond triplet block hex platform twins",[2,6,10]],
  ["Orbit Overdrive",265,["#211039","#8d4674","#ffcb9e"],"twins diamond platform triplet hex spike platform block twins diamond platform triplet hex block",[3,6,9,12]],
  ["Prism Parkway",270,["#10243e","#3f7d88","#adffa8"],"platform hex spike triplet diamond platform twins block hex triplet platform diamond twins spike",[2,5,8,11]],
  ["Electric Echo",275,["#2a1235","#965a73","#ffd66d"],"diamond platform triplet twins hex block platform diamond spike triplet hex platform twins block",[3,7,10]],
  ["Midnight Momentum",280,["#101631","#4b4c85","#84e7ff"],"triplet hex platform block twins diamond platform triplet spike hex block platform diamond twins triplet",[2,5,9,12]],
  ["Stardust Speedway",285,["#24123b","#865087","#ffc9ee"],"hex twins platform diamond triplet block platform hex spike triplet platform diamond block twins hex",[3,6,10,13]],
  ["Supernova Finale",290,["#26142d","#98624d","#fff09c"],"triplet platform diamond hex twins block platform triplet hex diamond platform twins block triplet hex platform",[2,5,8,11,14]]
];
for (const [name,speed,colors,pattern,flips] of extra) {
  designs.push({name,speed,colors,pattern:pattern.split(" "),gaps:[390,420,385,430],flips});
}
export const LEVELS = designs.map(d => {
  let x = 690, side = "floor";
  const obstacles = [], platforms = [], portals = [];
  d.pattern.forEach((type, i) => {
    if (d.flips?.includes(i)) {
      x += 260;
      side = side === "floor" ? "ceiling" : "floor";
      portals.push({x:x-300, gravity:side === "floor" ? 1 : -1});
    }
    if (type === "platform") {
      platforms.push({x,width:150,y:side === "floor" ? 68 : 160,height:12});
      obstacles.push({x:x+35,type:"twins",...TYPES.twins,side});
    } else {
      const shape = {...TYPES[type]};
      if (type === "triplet" && side === "ceiling") shape.width = 90;
      obstacles.push({x,type,...shape,side});
    }
    x += d.gaps[i % d.gaps.length];
  });
  return {name:d.name, speed:d.speed, colors:d.colors, obstacles, platforms, portals, length:x - d.gaps[(d.pattern.length-1)%d.gaps.length] + 850};
});

export function newRun(level = 0) {
  return {level, phase:"ready", distance:0, y:0, vy:0, ticks:0, gravity:1, grounded:true};
}
export function jump(run) {
  if (run.phase !== "running" || !run.grounded || run.vy !== 0) return false;
  run.vy = JUMP_SPEED * run.gravity;
  run.grounded = false;
  return true;
}

function overlaps(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      const project = points => points.map(v => v[0] * nx + v[1] * ny);
      const pa = project(a), pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

export function hazardPolygons(obstacle) {
  const {x,width,height,teeth,type} = obstacle;
  const base = obstacle.side === "ceiling" ? CEILING : 0;
  const direction = obstacle.side === "ceiling" ? -1 : 1;
  if (teeth) {
    const w=width/teeth;
    return Array.from({length:teeth},(_,i) => [[x+i*w,base],[x+(i+.5)*w,base+direction*height],[x+(i+1)*w,base]]);
  }
  if (type === "diamond") return [[[x,base+direction*height/2],[x+width/2,base],[x+width,base+direction*height/2],[x+width/2,base+direction*height]]];
  if (type === "hex") return [[[x,base+direction*height*.25],[x+width*.25,base],[x+width*.75,base],
    [x+width,base+direction*height*.25],[x+width*.75,base+direction*height],[x+width*.25,base+direction*height]]];
  return [[[x,base],[x+width,base],[x+width,base+direction*height],[x,base+direction*height]]];
}
export function collides(run, obstacle) {
  const x = run.distance + PLAYER_X, y = run.y;
  const player = [[x-11,y+3],[x+11,y+3],[x+11,y+25],[x-11,y+25]];
  return hazardPolygons(obstacle).some(poly => overlaps(player,poly));
}

export function advance(run) {
  if (run.phase !== "running") return;
  const level = LEVELS[run.level];
  const previousX = run.distance + PLAYER_X, previousY = run.y;
  run.distance = Math.min(level.length, run.distance + level.speed * STEP);
  const playerX = run.distance + PLAYER_X;
  for (const portal of level.portals) {
    if (previousX < portal.x && playerX >= portal.x) { run.gravity = portal.gravity; run.grounded = false; }
  }
  run.vy -= GRAVITY * run.gravity * STEP;
  run.y += run.vy * STEP;
  run.grounded = false;
  if (run.y <= 0 && run.gravity === 1) { run.y = 0; run.vy = 0; run.grounded = true; }
  if (run.y >= CEILING-PLAYER_SIZE && run.gravity === -1) { run.y = CEILING-PLAYER_SIZE; run.vy = 0; run.grounded = true; }
  for (const p of level.platforms) {
    if (playerX + 11 <= p.x || playerX - 11 >= p.x + p.width) continue;
    if (run.gravity === 1 && run.vy <= 0 && previousY >= p.y+p.height && run.y <= p.y+p.height) {
      run.y = p.y+p.height; run.vy = 0; run.grounded = true;
    } else if (run.gravity === -1 && run.vy >= 0 && previousY+PLAYER_SIZE <= p.y && run.y+PLAYER_SIZE >= p.y) {
      run.y = p.y-PLAYER_SIZE; run.vy = 0; run.grounded = true;
    }
  }
  run.y = Math.max(0,Math.min(CEILING-PLAYER_SIZE,run.y));
  run.ticks++;
  if (level.obstacles.some(o => o.x < playerX + 16 && o.x + o.width > playerX - 16 && collides(run,o))) {
    run.phase = "crashed";
  } else if (run.distance >= level.length) {
    run.phase = "complete";
  }
}

export function defaultSave() {
  return {version:2, unlocked:0, best:LEVELS.map(()=>0), options:{muted:false, volume:0.35},
    profile:{name:"Player 1",avatar:"nova"}, scores:[], run:newRun()};
}
function validCore(s, count) {
  if (!s || !Number.isInteger(s.unlocked) || s.unlocked < 0 || s.unlocked >= count ||
    !Array.isArray(s.best) || s.best.length !== count ||
    s.best.some((v,i) => !Number.isFinite(v) || v < 0 || v > LEVELS[i].length) ||
    !s.options || typeof s.options.muted !== "boolean" || !Number.isFinite(s.options.volume) ||
    s.options.volume < 0 || s.options.volume > 1 || !s.run) return false;
  const r = s.run;
  return Number.isInteger(r.level) && r.level >= 0 && r.level <= s.unlocked &&
    ["ready","running","paused","crashed","complete"].includes(r.phase) &&
    Number.isFinite(r.distance) && r.distance >= 0 && r.distance <= LEVELS[r.level].length &&
    Number.isFinite(r.y) && r.y >= 0 && r.y <= 1000 && Number.isFinite(r.vy) && Math.abs(r.vy) <= 1000 &&
    Number.isSafeInteger(r.ticks) && r.ticks >= 0;
}
export function validSave(s) {
  return !!s && s.version === 2 && validCore(s,LEVELS.length) &&
    s.profile && typeof s.profile.name === "string" && s.profile.name.trim().length > 0 && s.profile.name.length <= 24 &&
    AVATARS.includes(s.profile.avatar) && Array.isArray(s.scores) && s.scores.length <= 10 &&
    s.scores.every(e => e && typeof e.name === "string" && e.name.trim().length > 0 && e.name.length <= 24 &&
      Number.isInteger(e.level) && e.level >= 0 && e.level < LEVELS.length &&
      Number.isSafeInteger(e.points) && e.points >= 0 && Number.isInteger(e.percent) && e.percent >= 0 && e.percent <= 100 &&
      typeof e.complete === "boolean") &&
    (s.run.gravity === 1 || s.run.gravity === -1) && typeof s.run.grounded === "boolean";
}
export function playerName(value) { return value.trim().slice(0,24) || "Player 1"; }
export function recordScore(s) {
  const r=s.run, level=LEVELS[r.level], complete=r.phase === "complete";
  if (!["complete","crashed"].includes(r.phase) || r.distance <= 0) return;
  const entry={name:playerName(s.profile.name),level:r.level,
    points:Math.floor(r.distance*(1+r.level*0.12))+(complete ? 1000*(r.level+1) : 0),
    percent:Math.min(100,Math.floor(r.distance/level.length*100)),complete};
  s.scores=s.scores.filter(e => !(e.name === entry.name && e.level === entry.level && e.points === entry.points && e.complete === entry.complete));
  s.scores.push(entry);
  s.scores.sort((a,b) => b.points-a.points || b.percent-a.percent || a.name.localeCompare(b.name));
  s.scores=s.scores.slice(0,10);
}
export function restoreSave(s) {
  let restored = structuredClone(s);
  if (restored?.version === 1 && validCore(restored,3)) {
    restored.version=2;
    restored.best.push(...Array(LEVELS.length-3).fill(0));
    restored.profile={name:"Player 1",avatar:"nova"}; restored.scores=[];
    restored.run.gravity=1; restored.run.grounded=restored.run.y === 0 && restored.run.vy === 0;
    if (restored.best[2] >= LEVELS[2].length) restored.unlocked=Math.max(restored.unlocked,3);
  }
  if (!validSave(restored)) throw new Error("Invalid saved game");
  if (restored.run.phase === "running") restored.run.phase = "paused";
  return restored;
}
