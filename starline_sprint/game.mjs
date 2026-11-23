export const STEP = 1 / 60;
export const PLAYER_X = 150;
export const PLAYER_SIZE = 28;
const GRAVITY = 1650;
const JUMP_SPEED = 620;
const TYPES = {
  spike: {width: 34, height: 35, teeth: 1},
  twins: {width: 68, height: 39, teeth: 2},
  triplet: {width: 96, height: 42, teeth: 3},
  block: {width: 36, height: 58, teeth: 0}
};
const designs = [
  {name:"Dawn Circuit", speed:230, colors:["#082139","#0d5371","#ffd86d"], pattern:["spike","spike","twins","spike","block","twins","spike","block","twins","spike","twins","block"], gaps:[370,390,360,400]},
  {name:"Aurora Arcade", speed:250, colors:["#1a143d","#59448a","#7df2d0"], pattern:["spike","twins","block","spike","triplet","twins","block","twins","spike","triplet","block","spike","twins","block","triplet"], gaps:[375,405,360,420]},
  {name:"Starlight Rush", speed:270, colors:["#260f35","#87385b","#ffb5a3"], pattern:["twins","block","triplet","spike","twins","block","triplet","twins","spike","block","triplet","spike","twins","triplet","block","twins","triplet","block"], gaps:[390,420,375,430]}
];
export const LEVELS = designs.map(d => {
  let x = 690;
  const obstacles = d.pattern.map((type, i) => {
    const obstacle = {x, type, ...TYPES[type]};
    x += d.gaps[i % d.gaps.length];
    return obstacle;
  });
  return {name:d.name, speed:d.speed, colors:d.colors, obstacles, length:obstacles.at(-1).x + 850};
});

export function newRun(level = 0) {
  return {level, phase:"ready", distance:0, y:0, vy:0, ticks:0};
}
export function jump(run) {
  if (run.phase !== "running" || run.y !== 0 || run.vy !== 0) return false;
  run.vy = JUMP_SPEED;
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

export function collides(run, obstacle) {
  const x = run.distance + PLAYER_X, y = run.y;
  const player = [[x-11,y+3],[x+11,y+3],[x+11,y+25],[x-11,y+25]];
  if (obstacle.teeth === 0) {
    return overlaps(player, [[obstacle.x,0],[obstacle.x+obstacle.width,0],
      [obstacle.x+obstacle.width,obstacle.height],[obstacle.x,obstacle.height]]);
  }
  const width = obstacle.width / obstacle.teeth;
  for (let i = 0; i < obstacle.teeth; i++) {
    const left = obstacle.x + i * width;
    if (overlaps(player, [[left,0],[left+width/2,obstacle.height],[left+width,0]])) return true;
  }
  return false;
}

export function advance(run) {
  if (run.phase !== "running") return;
  const level = LEVELS[run.level];
  run.distance = Math.min(level.length, run.distance + level.speed * STEP);
  run.vy -= GRAVITY * STEP;
  run.y += run.vy * STEP;
  if (run.y <= 0) { run.y = 0; run.vy = 0; }
  run.ticks++;
  const playerX = run.distance + PLAYER_X;
  if (level.obstacles.some(o => o.x < playerX + 16 && o.x + o.width > playerX - 16 && collides(run,o))) {
    run.phase = "crashed";
  } else if (run.distance >= level.length) {
    run.phase = "complete";
  }
}

export function defaultSave() {
  return {version:1, unlocked:0, best:[0,0,0], options:{muted:false, volume:0.35}, run:newRun()};
}
export function validSave(s) {
  if (!s || s.version !== 1 || !Number.isInteger(s.unlocked) || s.unlocked < 0 || s.unlocked >= LEVELS.length ||
    !Array.isArray(s.best) || s.best.length !== LEVELS.length ||
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
export function restoreSave(s) {
  if (!validSave(s)) throw new Error("Invalid saved game");
  const restored = structuredClone(s);
  if (restored.run.phase === "running") restored.run.phase = "paused";
  return restored;
}
