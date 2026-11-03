const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine.js");

function advance(s, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) E.tick(s, input);
}
function fixture() {
  const s = E.createGame({ seed: "TEST", difficulty: 1 });
  s.rooms[0].enemies = [];
  return s;
}
function searchAll(s) {
  const item = E.nearestLoot(s);
  if (!item) return;
  for (let i = 0; i < 5 && !item.taken; i++) E.command(s, "search");
}
function route(s, start, end) {
  const queue = [start], previous = new Map([[start, null]]);
  for (const id of queue) {
    if (id === end) break;
    for (const next of Object.values(s.rooms[id].exits)) {
      if (!previous.has(next)) { previous.set(next, id); queue.push(next); }
    }
  }
  const path = [end];
  while (path[0] !== start) path.unshift(previous.get(path[0]));
  return path;
}

test("seeded 64-room tombs have reciprocal passages and a reachable idol/escape at all difficulties", () => {
  for (let difficulty = 1; difficulty <= 8; difficulty++) {
    for (let seed = 0; seed < 80; seed++) {
      const s = E.createGame({ seed: `TOMB-${seed}`, difficulty });
      assert.equal(s.rooms.length, 64);
      assert.ok(E.distances(s.rooms, 0).every(Number.isFinite));
      assert.ok(s.idolRoom >= 56);
      assert.ok(Number.isFinite(E.distances(s.rooms, s.idolRoom)[0]));
      assert.equal(s.rooms.flatMap(r => r.loot).filter(l => l.item === "idol").length, 1);
      for (const r of s.rooms) {
        for (const [direction, next] of Object.entries(r.exits)) {
          assert.equal(s.rooms[next].exits[E.OPPOSITE[direction]], r.id);
          assert.ok(E.neighbors(r.id).some(([d, id]) => d === direction && id === next));
        }
      }
    }
  }
  assert.deepEqual(E.createGame({ seed: "SAME", difficulty: 4 }), E.createGame({ seed: "SAME", difficulty: 4 }));
  assert.notDeepEqual(E.generate("ONE", 1), E.generate("TWO", 1));
});

test("classic commands persist, stop, turn, crawl, and switch to fighting", () => {
  const s = fixture();
  E.command(s, "walk"); advance(s, 1);
  assert.ok(Math.abs(s.player.x - 79) < 0.1);
  E.command(s, "stop"); advance(s, 1);
  assert.ok(Math.abs(s.player.x - 79) < 0.1);
  E.command(s, "faceLeft"); E.command(s, "crawl"); advance(s, 1);
  assert.ok(Math.abs(s.player.x - 54) < 0.1);
  assert.equal(s.player.duck, true);
  E.command(s, "fight");
  assert.equal(s.player.motion, "stop");
  assert.equal(s.player.fight, true);
  E.command(s, "spin"); assert.equal(s.player.facing, 1);
  E.command(s, "run"); assert.equal(s.player.fight, false);
});

test("stairs climb in both directions and align to supporting platforms", () => {
  const s = fixture();
  s.player.x = 250;
  E.command(s, "up"); advance(s, 1.5);
  assert.equal(s.player.x, 150);
  assert.equal(s.player.y, E.FLOORS[0]);
  assert.equal(s.player.grounded, true);
  E.command(s, "down"); advance(s, 1.5);
  assert.equal(s.player.x, 250);
  assert.equal(s.player.y, E.FLOORS[1]);
  s.player.x = 410;
  E.command(s, "down"); advance(s, 1.5);
  assert.equal(s.player.x, 310);
  assert.equal(s.player.y, E.FLOORS[2]);
  E.command(s, "up"); advance(s, 1.5);
  assert.equal(s.player.y, E.FLOORS[1]);
});

test("walking falls through a gap; jumping clears it without tunneling", () => {
  const fall = fixture();
  fall.player.x = 160; fall.player.y = E.FLOORS[0];
  advance(fall, 1.25, { modern: true, right: true });
  assert.equal(fall.player.y, E.FLOORS[1]);
  const jump = fixture();
  jump.player.x = 167; jump.player.y = E.FLOORS[0];
  E.command(jump, "jump"); advance(jump, 1, { modern: true, right: true });
  assert.equal(jump.player.y, E.FLOORS[0]);
  assert.ok(jump.player.x > 226);
  assert.equal(jump.player.grounded, true);
  assert.ok(jump.player.y < E.FLOORS[1]);
});

test("opening, looking, and taking are separate, persistent operations", () => {
  const s = fixture();
  s.player.x = 105;
  E.command(s, "take"); assert.equal(s.inventory.pistol, false);
  E.command(s, "open"); E.command(s, "take"); assert.equal(s.inventory.pistol, false);
  E.command(s, "look"); E.command(s, "take");
  assert.equal(s.inventory.pistol, true);
  assert.equal(s.inventory.ammo, 18);
  assert.equal(s.inventory.clue, true);
  E.command(s, "take"); assert.equal(s.inventory.ammo, 18);
  assert.equal(s.rooms[0].loot[0].taken, true);
  const rubble = s.rooms[0].loot[1];
  s.player.x = rubble.x; s.player.y = E.FLOORS[rubble.tier];
  E.command(s, "open"); assert.equal(rubble.layers, 1);
  E.command(s, "open"); assert.equal(rubble.layers, 0);
});

test("full-strength tonics remain in the room and refill at most to five", () => {
  const s = fixture();
  const loot = s.rooms[0].loot[0];
  loot.item = "tonic"; loot.layers = 0; loot.looked = true;
  s.player.x = loot.x; s.player.strength = 5;
  E.command(s, "take"); assert.equal(loot.taken, false);
  s.player.strength = 4;
  E.command(s, "take"); assert.equal(s.player.strength, 5);
  assert.equal(loot.taken, true);
});

test("machete respects range/facing/cooldown and pistol consumes finite ammo", () => {
  const s = fixture();
  const enemy = { type: "guardian", x: 65, y: 166, tier: 1, hp: 3, dir: 1, cooldown: 99, phase: 0 };
  s.rooms[0].enemies = [enemy];
  E.command(s, "slash"); assert.equal(enemy.hp, 2);
  E.command(s, "slash"); assert.equal(enemy.hp, 2);
  s.player.attack = 0; s.player.facing = -1;
  E.command(s, "lunge"); assert.equal(enemy.hp, 2);
  s.player.attack = 0; s.player.facing = 1;
  E.command(s, "fire"); assert.equal(s.projectiles.length, 0);
  s.inventory.pistol = true; s.inventory.ammo = 1;
  E.command(s, "fire"); assert.equal(s.inventory.ammo, 0);
  advance(s, 0.1); assert.equal(enemy.hp, 0);
  advance(s, 0.5); E.command(s, "fire");
  assert.equal(s.inventory.ammo, 0);
});

test("ducking avoids high guardian darts but standing does not", () => {
  for (const duck of [false, true]) {
    const s = fixture();
    s.projectiles = [{ x: 65, y: 151, vx: -110, enemy: true, life: 1 }];
    advance(s, 0.3, { modern: true, duck });
    assert.equal(s.player.strength, duck ? 3 : 2);
  }
});

test("dynamite falls, permits only one fuse, breaks optional terrain and hurts its owner", () => {
  const s = fixture();
  s.player.x = 95;
  E.command(s, "bomb"); E.command(s, "bomb");
  assert.equal(s.inventory.dynamite, 2);
  assert.equal(s.bombs.length, 1);
  advance(s, 2.5);
  assert.equal(s.bombs.length, 0);
  assert.equal(s.player.strength, 1);
  assert.ok(!s.rooms[0].platforms.some(p => p.fragile && p.tier === 1));
  assert.equal(s.rooms[0].stairs.length, 2);
  assert.ok(s.rooms[0].platforms.some(p => p.tier === 2));
  const safe = fixture();
  safe.rooms[0].walls = [{ x: 444, tier: 2, intact: true }];
  safe.player.x = 430; safe.player.y = E.FLOORS[2];
  E.command(safe, "bomb");
  advance(safe, 2.5, { modern: true, left: true });
  assert.equal(safe.rooms[0].walls[0].intact, false);
  assert.equal(safe.player.strength, 3);
  const falling = fixture();
  falling.player.x = 197; falling.player.y = E.FLOORS[0];
  E.command(falling, "bomb"); advance(falling, 1);
  assert.equal(falling.bombs[0].y, E.FLOORS[1]);
});

test("pause freezes time, combat, movement and fuses; dead/won states do not tick", () => {
  const s = fixture();
  E.command(s, "bomb"); E.setPaused(s, true);
  const before = JSON.stringify(s);
  E.command(s, "fire"); advance(s, 5, { modern: true, right: true });
  assert.equal(JSON.stringify(s), before);
  E.setPaused(s, false); advance(s, 0.1);
  assert.ok(s.time > 0);
  E.damage(s, 3, "test");
  assert.equal(s.status, "dead");
  const time = s.time;
  advance(s, 1); assert.equal(s.time, time);
});

test("leaving without the idol is blocked and successful escape scores time, not kills", () => {
  const s = fixture();
  advance(s, 1, { modern: true, left: true });
  assert.equal(s.status, "playing");
  assert.equal(s.player.x, 8);
  s.inventory.idol = true;
  advance(s, 0.1, { modern: true, left: true });
  assert.equal(s.status, "won");
  assert.ok(s.score > 9900);
  const before = s.time;
  advance(s, 10); assert.equal(s.time, before);
});

test("room transitions preserve opened containers and require the correct tier", () => {
  const s = fixture();
  s.player.x = 105; searchAll(s);
  const direction = Object.keys(s.rooms[0].exits).find(d => d === "right") || "down";
  if (direction === "right") {
    s.player.x = 551; advance(s, 0.1, { modern: true, right: true });
    assert.equal(s.roomId, 1);
    advance(s, 0.25, { modern: true, left: true });
  } else {
    s.player.x = 280; s.player.y = E.FLOORS[2];
    E.command(s, "down"); assert.equal(s.roomId, 8);
    E.command(s, "up");
  }
  assert.equal(s.roomId, 0);
  assert.equal(s.rooms[0].loot[0].taken, true);
  assert.equal(s.inventory.ammo, 18);
});

// This driver uses the same actions/physics as a player. It never relocates,
// heals, grants inventory, clears opponents, or sets the win state.
function completeExpedition(seed) {
  const s = E.createGame({ seed, difficulty: 1 });
  function defend() {
    const p = s.player;
    const threats = s.rooms[s.roomId].enemies.filter(e => e.hp > 0 &&
      Math.abs(e.y - p.y) < 28 && (e.x - p.x) * p.facing > -4);
    const target = threats.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (!target) return;
    const distance = Math.abs(target.x - p.x);
    if (distance < 32) E.command(s, "lunge");
    else if (distance < 150 && s.inventory.ammo) E.command(s, "fire");
  }
  function moveTo(target) {
    for (let i = 0; i < 1400; i++) {
      assert.equal(s.status, "playing", `${seed}: died in room ${s.roomId}, ${s.message}`);
      const p = s.player;
      if (Math.abs(target - p.x) < 2 && p.grounded) return;
      const direction = target > p.x ? 1 : -1;
      const tier = E.tierAt(p.y);
      if (p.grounded && tier >= 0) {
        const ahead = p.x + direction * 13;
        if (ahead > 8 && ahead < 552 && !E.supported(s.rooms[s.roomId], ahead, tier, 0)) E.command(s, "jump");
      }
      defend();
      const duck = s.projectiles.some(shot => shot.enemy && Math.abs(shot.x - p.x) < 70 &&
        Math.abs(shot.y - (p.y - 15)) < 4);
      const before = p.strength;
      E.tick(s, { modern: true, left: direction < 0, right: direction > 0, duck });
      if (process.env.AZTEC_TRACE && p.strength < before) console.log("Damage", s.roomId, Math.round(p.x), Math.round(p.y), s.message);
    }
    assert.fail(`${seed}: navigation stuck at ${s.player.x},${s.player.y}, target ${target}`);
  }
  function tierTo(target) {
    for (let tries = 0; E.tierAt(s.player.y) !== target && tries < 8; tries++) {
      const tier = E.tierAt(s.player.y);
      assert.ok(tier >= 0, "tier changes begin on a platform");
      const up = tier > target;
      const stair = s.rooms[s.roomId].stairs.find(st => up ? st.bottom === tier : st.top === tier);
      moveTo(up ? stair.x2 : stair.x1);
      E.command(s, up ? "up" : "down");
      advance(s, 1.5, { modern: true });
    }
    assert.equal(E.tierAt(s.player.y), target);
  }
  function supplies() {
    if (E.tierAt(s.player.y) !== 1) return;
    const item = s.rooms[s.roomId].loot[0];
    if (!item.taken && (item.item !== "tonic" || s.player.strength < 5)) {
      moveTo(item.x); searchAll(s);
    }
  }
  function travel(path) {
    for (const next of path.slice(1)) {
      const direction = Object.entries(s.rooms[s.roomId].exits).find(([, id]) => id === next)[0];
      if (direction === "left" || direction === "right") {
        tierTo(1); supplies(); moveTo(direction === "left" ? 9 : 551);
        advance(s, 0.12, { modern: true, [direction]: true });
      } else {
        tierTo(direction === "up" ? 0 : 2); moveTo(280);
        E.command(s, direction);
      }
      assert.equal(s.roomId, next);
    }
  }
  moveTo(105); searchAll(s);
  travel(route(s, 0, s.idolRoom));
  tierTo(0); moveTo(490); searchAll(s);
  assert.equal(s.inventory.idol, true);
  travel(route(s, s.idolRoom, 0));
  tierTo(1); moveTo(9);
  advance(s, 0.2, { modern: true, left: true });
  assert.equal(s.status, "won");
  assert.ok(s.roomsVisited >= 8);
  return { seed, time: Math.round(s.time), rooms: s.roomsVisited, strength: s.player.strength };
}

test("complete untouched expeditions retrieve the idol and physically return to the entrance", () => {
  for (const seed of ["JADE", "DAYLIGHT", "EXPEDITION"]) {
    const result = completeExpedition(seed);
    console.log("Complete expedition:", result);
  }
});

module.exports = { route };
