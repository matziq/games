(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AztecEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WIDTH = 560;
  const FLOORS = [74, 166, 258];
  const SIZE = 8;
  const STEP = 1 / 60;
  const AIR_SECONDS = 8;
  const FLOOD_LIMIT = 76;
  const ROCK_WARNING = 1.4;
  const OPPOSITE = { left: "right", right: "left", up: "down", down: "up" };
  const ITEMS = ["ammo", "tonic", "dynamite", "ammo", "tonic", "journal"];
  const NAMES = {
    kit: "PISTOL + 18 ROUNDS + A SURVEY",
    ammo: "6 PISTOL ROUNDS",
    tonic: "A STRENGTH TONIC",
    dynamite: "2 STICKS OF DYNAMITE",
    journal: "AN EXPLORER'S SURVEY",
    idol: "THE JADE IDOL"
  };

  function random(seed) {
    let hash = 2166136261;
    for (const c of String(seed)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return function () {
      hash += 0x6d2b79f5;
      let n = hash;
      n = Math.imul(n ^ (n >>> 15), n | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function neighbors(id) {
    const row = Math.floor(id / SIZE), col = id % SIZE;
    return [
      col > 0 && ["left", id - 1], col < SIZE - 1 && ["right", id + 1],
      row > 0 && ["up", id - SIZE], row < SIZE - 1 && ["down", id + SIZE]
    ].filter(Boolean);
  }

  function distances(rooms, start) {
    const result = Array(rooms.length).fill(Infinity);
    result[start] = 0;
    const queue = [start];
    for (const id of queue) {
      for (const next of Object.values(rooms[id].exits)) {
        if (result[next] !== Infinity) continue;
        result[next] = result[id] + 1;
        queue.push(next);
      }
    }
    return result;
  }

  function generate(seed, difficulty) {
    const rng = random(seed);
    const rooms = Array.from({ length: SIZE * SIZE }, (_, id) => ({
      id, exits: {}, visited: false,
      platforms: [
        { x1: 8, x2: 80, tier: 0 }, { x1: 80, x2: 112, tier: 0, fragile: true },
        { x1: 112, x2: 176, tier: 0 }, { x1: 220, x2: 552, tier: 0 },
        { x1: 8, x2: 80, tier: 1 }, { x1: 80, x2: 112, tier: 1, fragile: true },
        { x1: 112, x2: 338, tier: 1 }, { x1: 382, x2: 552, tier: 1 },
        { x1: 8, x2: 552, tier: 2 }
      ],
      stairs: [
        { top: 0, bottom: 1, x1: 150, x2: 250 },
        { top: 1, bottom: 2, x1: 410, x2: 310 }
      ],
      walls: id && rng() < 0.4 ? [{ x: 444, tier: 2, intact: true }] : [],
      loot: [], enemies: [], hazard: null
    }));
    function connect(a, direction, b) {
      rooms[a].exits[direction] = b;
      rooms[b].exits[OPPOSITE[direction]] = a;
    }
    const seen = new Set([0]), stack = [0];
    while (stack.length) {
      const current = stack[stack.length - 1];
      const options = neighbors(current).filter(([, id]) => !seen.has(id));
      if (!options.length) { stack.pop(); continue; }
      const [direction, next] = options[Math.floor(rng() * options.length)];
      connect(current, direction, next);
      seen.add(next);
      stack.push(next);
    }
    for (const room of rooms) {
      for (const [direction, next] of neighbors(room.id)) {
        if (rng() < 0.46) connect(room.id, direction, next);
      }
    }
    const dist = distances(rooms, 0);
    const bottom = rooms.slice(56).map(r => r.id);
    const idolRoom = bottom.reduce((best, id) => dist[id] > dist[best] ? id : best);
    for (const room of rooms) {
      const loot = (x, tier, kind, item) => ({
        x, tier, kind, item, layers: kind === "rubble" ? 2 : 1,
        looked: false, taken: false
      });
      room.loot.push(loot(105, 1, "chest", room.id === 0 ? "kit" : ITEMS[Math.floor(rng() * ITEMS.length)]));
      room.loot.push(loot(490, 0, "rubble", room.id === idolRoom ? "idol" : ITEMS[Math.floor(rng() * ITEMS.length)]));
      if (room.walls.length) room.loot.push(loot(495, 2, "chest", "tonic"));
      if (!room.id) continue;
      const count = 1 + Math.floor(rng() * (1 + difficulty / 3));
      for (let i = 0; i < count; i++) {
        const type = ["serpent", "spider", "guardian", "bat"][Math.floor(rng() * 4)];
        const tier = type === "serpent" ? 2 : type === "spider" ? 0 : 1;
        room.enemies.push({
          type, tier, x: 430 + rng() * 75, home: 450, dir: -1,
          hp: type === "guardian" ? 3 : 2, cooldown: 1 + rng() * 2,
          phase: rng() * 6.28, y: FLOORS[tier]
        });
      }
      if (rng() < 0.3) room.hazard = {
        type: rng() < 0.6 ? "spikes" : "ceiling", x: 470, width: 58,
        tier: 2, phase: rng() * 6.28
      };
    }
    // A separate stream preserves existing seeds' rooms, loot and opponents.
    const trapRng = random(seed + ":water-and-stone");
    const candidates = rooms.filter(r => r.id !== 0 && !r.hazard);
    for (const r of rooms.slice(1)) {
      if (candidates.length >= 2) break;
      if (!candidates.includes(r)) candidates.push(r);
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(trapRng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const trapCount = Math.max(2, Math.round(candidates.length * (0.2 + difficulty * 0.012)));
    for (let i = 0; i < trapCount; i++) {
      const shift = Math.floor(trapRng() * 3);
      candidates[i].hazard = i % 2 === 0 ?
        { type: "flood", startedAt: null, level: 0, rate: 1.4 + difficulty * 0.18 } :
        { type: "rocks", startedAt: null, nextDrop: null, drops: 0, warning: false,
          columns: [402, 434, 466].map((_, n, list) => list[(n + shift) % list.length]),
          interval: 4.4 - difficulty * 0.23, rocks: [] };
    }
    rooms[0].visited = true;
    return { rooms, idolRoom };
  }

  function createGame(options = {}) {
    const difficulty = Math.max(1, Math.min(8, Math.floor(Number(options.difficulty) || 1)));
    const seed = String(options.seed || "QUETZAL").slice(0, 32);
    const world = generate(seed, difficulty);
    return {
      seed, difficulty, ...world, roomId: 0, time: 0, status: "playing", paused: false,
      player: {
        x: 40, y: FLOORS[1], vy: 0, facing: 1, grounded: true,
        climbing: null, duck: false, motion: "stop", fight: false, drawn: false,
        stepTime: 0, strength: 3, hurt: 0, attack: 0, attackKind: "slash",
        air: AIR_SECONDS, drownTimer: 0
      },
      inventory: { machete: true, pistol: false, ammo: 0, dynamite: 3, idol: false, clue: false },
      bombs: [], projectiles: [], effects: [], events: [],
      message: "FIND THE IDOL. RETURN HERE. SEARCH THE CHEST.",
      messageTime: 6, score: 0, roomsVisited: 1
    };
  }

  function say(state, text, event) {
    state.message = text;
    state.messageTime = 4;
    if (event) emit(state, event);
  }

  function emit(state, type, source = state.player, roomId = state.roomId) {
    state.events.push({ type, roomId, x: source.x, y: source.y, time: state.time });
  }

  function active(state) { return state.status === "playing" && !state.paused; }
  function room(state) { return state.rooms[state.roomId]; }
  function tierAt(y) { return FLOORS.findIndex(floor => Math.abs(floor - y) < 9); }

  function stop(state) {
    state.player.motion = "stop";
    state.player.stepTime = 0;
    state.player.duck = false;
  }

  function setPaused(state, value) {
    if (state.status !== "playing") return;
    state.paused = Boolean(value);
    stop(state);
  }

  function damage(state, amount, reason) {
    const p = state.player;
    if (p.hurt > 0 || state.status !== "playing") return false;
    p.strength = Math.max(0, p.strength - amount);
    p.hurt = 1.6;
    say(state, reason, "hurt");
    if (p.strength === 0) {
      state.status = "dead";
      stop(state);
      say(state, "THE TOMB CLAIMS ANOTHER EXPLORER.", "dead");
    }
    return true;
  }

  function nearestLoot(state) {
    const p = state.player;
    return room(state).loot.find(item => !item.taken && Math.abs(item.x - p.x) < 24 &&
      Math.abs(FLOORS[item.tier] - p.y) < 10);
  }

  function search(state, operation) {
    const item = nearestLoot(state);
    stop(state);
    if (!item) { say(state, "NOTHING TO SEARCH HERE. MOVE CLOSER."); return; }
    if (operation === "search") operation = item.layers > 0 ? "open" : item.looked ? "take" : "look";
    if (operation === "open") {
      if (item.layers > 0) {
        item.layers--;
        say(state, item.layers ? "A LAYER OF RUBBLE REMOVED. KEEP SEARCHING." : "OPEN. LOOK INSIDE, THEN TAKE.", "search");
      } else say(state, "ALREADY OPEN. LOOK INSIDE, THEN TAKE.");
    } else if (operation === "look") {
      if (item.layers) say(state, "OPEN IT FIRST.");
      else { item.looked = true; say(state, NAMES[item.item] + ". TAKE IT."); }
    } else {
      if (item.layers || !item.looked) { say(state, "OPEN, LOOK, THEN TAKE."); return; }
      if (item.item === "tonic" && state.player.strength >= 5) {
        say(state, "STRENGTH FULL. THE TONIC CAN WAIT."); return;
      }
      item.taken = true;
      const inv = state.inventory;
      if (item.item === "kit") { inv.pistol = true; inv.ammo += 18; inv.clue = true; }
      if (item.item === "ammo") inv.ammo += 6;
      if (item.item === "dynamite") inv.dynamite += 2;
      if (item.item === "tonic") state.player.strength = Math.min(5, state.player.strength + 2);
      if (item.item === "journal") inv.clue = true;
      if (item.item === "idol") inv.idol = true;
      say(state, item.item === "idol" ? "THE JADE IDOL! RETURN TO THE ENTRANCE." :
        "TAKEN: " + NAMES[item.item] + ".", item.item === "idol" ? "idol" : "loot");
    }
  }

  function enterRoom(state, target, from) {
    state.roomId = target;
    const p = state.player;
    p.x = from === "left" ? 18 : from === "right" ? 542 : 280;
    p.y = from === "up" ? FLOORS[0] : from === "down" ? FLOORS[2] : FLOORS[1];
    p.vy = 0;
    p.grounded = true;
    p.climbing = null;
    p.hurt = Math.max(p.hurt, 0.65);
    state.projectiles = [];
    if (!room(state).visited) { room(state).visited = true; state.roomsVisited++; }
    say(state, `DEPTH ${Math.floor(target / 8) + 1} / CHAMBER ${target % 8 + 1}`);
  }

  function climb(state, direction = 0) {
    const p = state.player, r = room(state);
    if (p.climbing || !p.grounded) return;
    const tier = tierAt(p.y);
    if (Math.abs(p.x - 280) < 20) {
      if (tier === 0 && r.exits.up !== undefined && direction <= 0) {
        enterRoom(state, r.exits.up, "down"); return;
      }
      if (tier === 2 && r.exits.down !== undefined && direction >= 0) {
        enterRoom(state, r.exits.down, "up"); return;
      }
    }
    for (const stair of r.stairs) {
      const up = tier === stair.bottom && Math.abs(p.x - stair.x2) < 22 && direction <= 0;
      const down = tier === stair.top && Math.abs(p.x - stair.x1) < 22 && direction >= 0;
      if (!up && !down) continue;
      stop(state);
      p.fight = false;
      p.climbing = { ...stair, progress: up ? 1 : 0, direction: up ? -1 : 1 };
      p.grounded = false;
      return;
    }
    say(state, "STAND AT A STAIR END OR A MARKED SHAFT.");
  }

  function hurtEnemy(state, enemy, amount) {
    enemy.hp = Math.max(0, enemy.hp - amount);
    state.effects.push({ roomId: state.roomId, x: enemy.x, y: enemy.y - 12, life: 0.16, kind: "hit" });
    emit(state, "hit", enemy);
  }

  function attack(state, kind) {
    const p = state.player;
    if (p.attack > 0 || p.climbing) return;
    p.attack = kind === "lunge" ? 0.65 : 0.4;
    p.attackKind = kind;
    const reach = kind === "lunge" ? 43 : 32;
    emit(state, "swing");
    for (const enemy of room(state).enemies) {
      const dx = (enemy.x - p.x) * p.facing;
      if (enemy.hp > 0 && dx > -7 && dx < reach && Math.abs(enemy.y - p.y) < 27) {
        hurtEnemy(state, enemy, kind === "lunge" ? 2 : 1);
      }
    }
  }

  function fire(state) {
    const p = state.player;
    if (p.attack > 0 || p.climbing) return;
    if (!state.inventory.pistol) { say(state, "NO PISTOL. SEARCH THE ENTRANCE CHEST."); return; }
    if (!state.inventory.ammo) { say(state, "NO AMMUNITION. USE THE MACHETE."); return; }
    state.inventory.ammo--;
    p.attack = 0.36;
    p.attackKind = "pistol";
    state.projectiles.push({
      x: p.x + 8 * p.facing, y: p.y - (p.duck ? 6 : 12),
      vx: p.facing * 280, enemy: false, life: 2
    });
    emit(state, "shot");
  }

  function plant(state) {
    const p = state.player;
    if (state.bombs.length) { say(state, "ONE LIT FUSE AT A TIME. STAND BACK."); return; }
    if (!state.inventory.dynamite) { say(state, "NO DYNAMITE LEFT."); return; }
    if (p.climbing) { say(state, "FINISH CLIMBING BEFORE PLACING DYNAMITE."); return; }
    state.inventory.dynamite--;
    state.bombs.push({ roomId: state.roomId, x: p.x, y: p.y, vy: 0, fuse: 2.4 });
    say(state, "FUSE LIT. BREAK STONE / STRIKE FOES. RUN CLEAR!", "fuse");
  }

  function command(state, action) {
    if (!active(state)) return;
    const p = state.player;
    if (action === "walk" || action === "run" || action === "crawl") {
      p.motion = action; p.fight = false; p.duck = action === "crawl";
    } else if (action === "stop") stop(state);
    else if (action === "faceLeft" || action === "faceRight") p.facing = action === "faceLeft" ? -1 : 1;
    else if (action === "stepLeft" || action === "stepRight") {
      p.facing = action === "stepLeft" ? -1 : 1; p.stepTime = 0.22;
    } else if (action === "spin") p.facing *= -1;
    else if (action === "fight") {
      stop(state); p.fight = true; say(state, "FIGHT: M SLASH / L LUNGE / G PISTOL / SPACE FIRE");
    } else if (action === "draw") {
      p.drawn = state.inventory.pistol;
      say(state, p.drawn ? "PISTOL DRAWN. SPACE TO FIRE." : "NO PISTOL. SEARCH THE ENTRANCE CHEST.");
    } else if (action === "jump") {
      if (p.grounded && !p.climbing) {
        p.vy = -205; p.grounded = false; p.duck = false; p.fight = false;
        emit(state, "jump");
      }
    } else if (action === "climb") climb(state);
    else if (action === "up") climb(state, -1);
    else if (action === "down") climb(state, 1);
    else if (["open", "look", "take", "search"].includes(action)) search(state, action);
    else if (action === "slash" || action === "lunge") attack(state, action);
    else if (action === "fire") fire(state);
    else if (action === "bomb") plant(state);
  }

  function supported(r, x, tier, padding = 4) {
    return r.platforms.some(p => p.tier === tier && x + padding >= p.x1 && x - padding <= p.x2);
  }

  function land(r, entity, previousY, padding) {
    if (entity.vy < 0) return false;
    for (let tier = 0; tier < FLOORS.length; tier++) {
      if (previousY <= FLOORS[tier] + 0.01 && entity.y >= FLOORS[tier] &&
          supported(r, entity.x, tier, padding)) {
        entity.y = FLOORS[tier]; entity.vy = 0; return true;
      }
    }
    return false;
  }

  function explode(state, bomb) {
    const r = state.rooms[bomb.roomId];
    state.effects.push({ roomId: bomb.roomId, x: bomb.x, y: bomb.y - 8, life: 0.45, kind: "blast" });
    const before = r.platforms.length;
    r.platforms = r.platforms.filter(p => !p.fragile ||
      Math.abs(FLOORS[p.tier] - bomb.y) > 46 || bomb.x < p.x1 - 42 || bomb.x > p.x2 + 42);
    let broken = before - r.platforms.length, defeated = 0;
    for (const wall of r.walls) {
      if (wall.intact && Math.abs(wall.x - bomb.x) < 55 && Math.abs(FLOORS[wall.tier] - bomb.y) < 50) {
        wall.intact = false; broken++;
      }
    }
    for (const enemy of r.enemies) {
      if (enemy.hp > 0 && Math.hypot(enemy.x - bomb.x, enemy.y - bomb.y) < 65) {
        enemy.hp = 0; defeated++;
      }
    }
    for (const item of r.loot) {
      while (!item.taken && item.tier < 2 && !supported(r, item.x, item.tier, 0)) item.tier++;
    }
    emit(state, "blast", bomb, bomb.roomId);
    if (bomb.roomId === state.roomId) {
      if (Math.hypot(state.player.x - bomb.x, state.player.y - bomb.y) < 58) {
        damage(state, 2, "TOO CLOSE TO YOUR OWN DYNAMITE.");
      } else say(state, broken || defeated ? `BLAST: ${broken} STONE SECTIONS / ${defeated} FOES.` :
        "BLAST CLEARS. NO BREAKABLE STONE OR FOES IN RANGE.");
    }
  }

  function movePlayer(state, input, dt) {
    const p = state.player, r = room(state);
    if (p.climbing) {
      const s = p.climbing;
      s.progress = Math.max(0, Math.min(1, s.progress + s.direction * dt * 0.72));
      p.x = s.x1 + (s.x2 - s.x1) * s.progress;
      p.y = FLOORS[s.top] + (FLOORS[s.bottom] - FLOORS[s.top]) * s.progress;
      p.facing = Math.sign((s.x2 - s.x1) * s.direction);
      if (s.progress === 0 || s.progress === 1) {
        p.climbing = null; p.grounded = true; p.vy = 0;
      }
      return;
    }
    let velocity = 0;
    if (input.modern) {
      p.duck = Boolean(input.duck) && p.grounded;
      velocity = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * (p.duck ? 25 : 70);
      if (velocity) p.facing = Math.sign(velocity);
    } else {
      p.duck = p.motion === "crawl" && p.grounded;
      velocity = p.facing * ({ walk: 39, run: 70, crawl: 25, stop: 0 }[p.motion]);
      if (p.stepTime > 0) velocity = p.facing * 36;
    }
    const oldX = p.x;
    p.x += velocity * dt;
    for (const wall of r.walls) {
      if (!wall.intact || p.y < FLOORS[wall.tier] - 30 || p.y - 22 >= FLOORS[wall.tier]) continue;
      if (p.x + 6 > wall.x && p.x - 6 < wall.x + 10) p.x = oldX <= wall.x ? wall.x - 6 : wall.x + 16;
    }
    if (p.x < 8 || p.x > 552) {
      const side = p.x < 8 ? "left" : "right";
      if (tierAt(p.y) === 1 && r.exits[side] !== undefined) {
        enterRoom(state, r.exits[side], OPPOSITE[side]); return;
      }
      if (state.roomId === 0 && side === "left" && tierAt(p.y) === 1) {
        if (state.inventory.idol) {
          state.status = "won";
          state.score = Math.max(100, Math.round(state.difficulty * 10000 - state.time * 5));
          stop(state);
          say(state, "DAYLIGHT. THE JADE IDOL IS YOURS.", "win");
        } else say(state, "THE ENTRANCE. FIND THE IDOL BEFORE LEAVING.");
      }
      p.x = Math.max(8, Math.min(552, p.x));
    }
    const previousY = p.y;
    p.vy += 440 * dt;
    p.y += p.vy * dt;
    p.grounded = land(r, p, previousY, 4);
    if (p.y > 280) {
      p.y = FLOORS[2]; p.vy = 0; p.grounded = true;
      damage(state, 1, "A HARD FALL ONTO THE TOMB FLOOR.");
    }
  }

  function moveEnemies(state, dt) {
    const r = room(state), p = state.player;
    for (const e of r.enemies) {
      if (e.hp <= 0) continue;
      e.phase += dt;
      e.cooldown -= dt;
      const dx = p.x - e.x;
      const sameTier = Math.abs(p.y - FLOORS[e.tier]) < 26;
      let speed = e.type === "serpent" ? 17 : e.type === "spider" ? 13 : e.type === "bat" ? 28 : 10;
      speed += state.difficulty * 1.6;
      if (sameTier && Math.abs(dx) < 125 + state.difficulty * 6) {
        e.dir = Math.sign(dx) || e.dir;
        if (e.type === "serpent") speed *= 1.8;
      } else if (e.x < 397 || e.x > 525) e.dir *= -1;
      const next = e.x + e.dir * speed * dt;
      if (e.type !== "bat" && (!supported(r, next, e.tier, 0) ||
          r.walls.some(w => w.intact && w.tier === e.tier && next > w.x - 8 && next < w.x + 18))) {
        e.dir *= -1;
      } else e.x = Math.max(16, Math.min(544, next));
      e.y = FLOORS[e.tier] - (e.type === "bat" ? 14 + Math.sin(e.phase * 3) * 8 : 0);
      if (e.type === "guardian" && sameTier && Math.abs(dx) < 190 && Math.abs(dx) > 32 && e.cooldown <= 0) {
        state.projectiles.push({ x: e.x, y: e.y - 15, vx: e.dir * (90 + state.difficulty * 5), enemy: true, life: 3 });
        e.cooldown = Math.max(1.2, 3.5 - state.difficulty * 0.2);
      }
      const avoidsBat = e.type === "bat" && p.duck;
      if (!avoidsBat && Math.abs(e.x - p.x) < 14 && Math.abs(e.y - p.y) < 24) {
        damage(state, 1, "STRUCK BY A " + e.type.toUpperCase() + ". FIGHT OR RETREAT.");
      }
    }
  }

  function moveProjectiles(state, dt) {
    const r = room(state), p = state.player;
    for (const shot of state.projectiles) {
      shot.x += shot.vx * dt;
      shot.life -= dt;
      if (r.walls.some(w => w.intact && Math.abs(shot.x - w.x - 5) < 10 &&
          shot.y > FLOORS[w.tier] - 32 && shot.y < FLOORS[w.tier])) shot.life = 0;
      if (shot.life <= 0) continue;
      if (shot.enemy) {
        if (Math.abs(shot.x - p.x) < 8 && shot.y > p.y - (p.duck ? 10 : 24) && shot.y < p.y) {
          damage(state, 1, "A GUARD'S DART. DUCK UNDER THE NEXT ONE.");
          shot.life = 0;
        }
      } else {
        const enemy = r.enemies.find(e => e.hp > 0 && Math.abs(e.x - shot.x) < 12 &&
          shot.y > e.y - 27 && shot.y < e.y + 3);
        if (enemy) { hurtEnemy(state, enemy, 2); shot.life = 0; }
      }
    }
    state.projectiles = state.projectiles.filter(s => s.life > 0 && s.x > 0 && s.x < WIDTH);
  }

  function updateTraps(state, dt) {
    for (const r of state.rooms) {
      const h = r.hazard;
      if (!h || !["flood", "rocks"].includes(h.type)) continue;
      if (h.startedAt === null) {
        if (r.id !== state.roomId) continue;
        h.startedAt = state.time;
        if (h.type === "rocks") h.nextDrop = state.time + 3;
        say(state, h.type === "flood" ? "WATER SEEPS IN. CLIMB TO THE MIDDLE TIER." :
          "LOOSE STONE ABOVE. WATCH THE DUST; STEP ASIDE.", "warning");
      }
      if (h.type === "flood") {
        // The middle-tier passages and upper stairs remain dry, even on a late return.
        h.level = Math.min(FLOOD_LIMIT, Math.max(0, state.time - h.startedAt - 8) * h.rate);
        continue;
      }
      if (state.time >= h.nextDrop) {
        h.rocks.push({ x: h.columns[h.drops % h.columns.length], y: 23, vy: 0 });
        h.drops++;
        h.nextDrop += h.interval;
        if (r.id === state.roomId) emit(state, "rock", h.rocks[h.rocks.length - 1]);
      }
      h.warning = state.time >= h.nextDrop - ROCK_WARNING;
      for (const rock of h.rocks) {
        const previousY = rock.y;
        rock.vy += 220 * dt;
        rock.y += rock.vy * dt;
        const p = state.player;
        const hit = r.id === state.roomId && Math.abs(rock.x - p.x) < 12 &&
          previousY - 10 < p.y && rock.y >= p.y - (p.duck ? 12 : 26);
        if (hit) damage(state, 1, "STRUCK BY FALLING STONE. STEP OUT OF THE DUST.");
        rock.spent = hit || land(r, rock, previousY, 5) || rock.y > 270;
        if (rock.spent && r.id === state.roomId) {
          state.effects.push({ roomId: r.id, x: rock.x, y: rock.y, kind: "hit", life: 0.16 });
          emit(state, "rock-impact", rock);
        }
      }
      h.rocks = h.rocks.filter(rock => !rock.spent);
    }
    const p = state.player, h = room(state).hazard;
    const submerged = h?.type === "flood" && h.level > 0 &&
      p.y - (p.duck ? 8 : 22) > FLOORS[2] - h.level;
    if (!submerged) { p.air = AIR_SECONDS; p.drownTimer = 0; return; }
    const previousAir = p.air;
    p.air = Math.max(0, p.air - dt);
    if (previousAir > 4 && p.air <= 4) say(state, "AIR RUNNING OUT. CLIMB OR REACH THE DOWN SHAFT!", "warning");
    if (p.air === 0) {
      p.drownTimer -= dt;
      if (p.drownTimer <= 0) {
        damage(state, 1, "OUT OF AIR. CLIMB ABOVE THE WATER!");
        p.drownTimer = 2;
      }
    }
  }

  function tick(state, input = {}, elapsed = STEP) {
    if (!active(state) || !Number.isFinite(elapsed) || elapsed <= 0) return;
    let remaining = Math.min(elapsed, 0.25);
    while (remaining > 0.000001 && active(state)) {
      const dt = Math.min(STEP, remaining);
      remaining -= dt;
      state.time += dt;
      state.messageTime = Math.max(0, state.messageTime - dt);
      for (const key of ["hurt", "attack", "stepTime"]) state.player[key] = Math.max(0, state.player[key] - dt);
      movePlayer(state, input, dt);
      if (state.status !== "playing") break;
      moveEnemies(state, dt);
      moveProjectiles(state, dt);
      for (const bomb of state.bombs) {
        const before = bomb.y;
        bomb.vy += 440 * dt;
        bomb.y += bomb.vy * dt;
        land(state.rooms[bomb.roomId], bomb, before, 1);
        bomb.fuse -= dt;
        if (bomb.fuse <= 0) explode(state, bomb);
      }
      state.bombs = state.bombs.filter(b => b.fuse > 0);
      updateTraps(state, dt);
      const hazard = room(state).hazard;
      if (hazard && ["spikes", "ceiling"].includes(hazard.type)) {
        const p = state.player;
        const dangerous = hazard.type === "spikes" || Math.sin(state.time * 1.6 + hazard.phase) > 0.68;
        if (dangerous && p.x > hazard.x && p.x < hazard.x + hazard.width &&
            Math.abs(p.y - FLOORS[hazard.tier]) < 5) {
          damage(state, 1, hazard.type === "spikes" ? "SHARP STONES. JUMP CLEAR." : "THE CEILING DESCENDS. GET CLEAR.");
        }
      }
      for (const effect of state.effects) effect.life -= dt;
      state.effects = state.effects.filter(e => e.life > 0);
      if (state.events.length > 32) state.events.splice(0, state.events.length - 32);
    }
  }

  return { WIDTH, FLOORS, SIZE, STEP, AIR_SECONDS, FLOOD_LIMIT, ROCK_WARNING, OPPOSITE, NAMES, random, neighbors, distances,
    generate, createGame, command, tick, setPaused, damage, nearestLoot, supported, tierAt };
});
