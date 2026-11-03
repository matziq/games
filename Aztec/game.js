(function () {
  "use strict";
  const E = window.AztecEngine;
  const $ = id => document.getElementById(id);
  const canvas = $("game"), ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const color = { white: "#eeeee4", muted: "#aaa99e", pink: "#ec62dc", green: "#76e890", orange: "#ffa64b", dark: "#25251e" };
  const held = new Set(), pointers = new Map();
  const preview = E.createGame({ seed: "THE JADE EXPEDITION", difficulty: 1 });
  let state = null, keyboard = "classic", touchUsed = false, soundOn = false, audio = null;
  let lastTime = 0, accumulator = 0, lastAnnouncement = "", ended = false;
  let modalWasPaused = false, modalId = null, uiCounter = 0;
  const sprites = {
    chest: ["ooooooo", "owooowo", "ooooooo", "ooo.ooo", "ooooooo"],
    idol: ["..ggg..", ".ggggg.", ".g.g.g.", "..ggg..", ".ggggg.", "ggggggg", "..g.g..", ".gg.gg."],
    serpent: [".........ww...", "........wgw...", "..wwwwwwww....", ".ww..ww.......", "ww............"],
    spider: ["w..w...w..w", ".w.wwwww.w.", "..wwgwwww..", ".w.wwwww.w.", "w..w...w..w"],
    bat: ["w.........w", "ww.......ww", "www..w..www", ".wwwwwwwww.", "..wwwgwww..", "....www...."],
    rubble: ["...w.......w..", "..www..w..ww..", ".w.ww.www.w.w.", "wwwwwwwwwwwwww"]
  };
  const palette = { w: color.white, g: color.green, o: color.orange };

  function rect(x, y, width, height, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
  }
  function text(value, x, y, fill = color.white, size = 9, align = "left") {
    ctx.fillStyle = fill;
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.fillText(value, Math.round(x), Math.round(y));
    ctx.textAlign = "left";
  }
  function sprite(pattern, x, bottom, scale = 2, flip = false) {
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        const fill = palette[pattern[row][col]];
        if (fill) rect(x + (flip ? pattern[row].length - 1 - col : col) * scale, bottom - (pattern.length - row) * scale, scale, scale, fill);
      }
    }
  }

  function person(p, time, guard = false) {
    const x = Math.round(p.x), y = Math.round(p.y);
    if (!guard && p.hurt > 0 && !reducedMotion.matches && Math.floor(time * 10) % 2) return;
    const body = guard ? color.green : color.white, facing = p.facing || p.dir;
    const moving = p.climbing || p.motion !== "stop" || held.has("ArrowLeft") || held.has("ArrowRight") || pointers.size;
    const stride = moving && !reducedMotion.matches ? Math.round(Math.sin(time * 13) * 3) : 1;
    if (p.duck) {
      rect(x - 5, y - 10, 8, 3, body); rect(x + facing * 4 - 2, y - 14, 5, 5, color.white);
      rect(x - 6, y - 5, 12, 2, body); rect(x - 6, y - 3, 3, 3, body); rect(x + 4, y - 3, 3, 3, body);
    } else {
      rect(x - 4, y - 25, 9, 2, guard ? color.pink : color.orange);
      rect(x - 2, y - 28, 5, 3, guard ? color.green : color.orange);
      rect(x - 2, y - 23, 5, 5, color.white);
      rect(x + facing * 3, y - 22, 2, 2, color.white);
      rect(x - 2, y - 17, 5, 9, body);
      rect(x - 3, y - 9, 7, 2, color.orange);
      rect(x - 4 - stride, y - 7, 3, 5, body); rect(x + 2 + stride, y - 7, 3, 5, body);
      rect(x - 5 - stride, y - 2, 5, 2, body); rect(x + 2 + stride, y - 2, 5, 2, body);
      rect(x - 5, y - 16, 2, 6, body); rect(x + 5, y - 16, 2, 6, body);
    }
    const handY = y - (p.duck ? 8 : 13);
    if (guard) rect(x + facing * 9, y - 27, 2, 25, color.orange);
    else if (p.attack > 0 || p.drawn) {
      const length = p.attackKind === "lunge" ? 27 : 17;
      rect(x + (facing > 0 ? 6 : -length - 6), handY, length, 2, p.attackKind === "pistol" ? color.orange : color.white);
    }
  }

  function drawRoom(s) {
    const r = s.rooms[s.roomId];
    rect(0, 0, 560, 320, "#000");
    text(`DEPTH ${Math.floor(s.roomId / 8) + 1}`, 10, 10, color.muted, 8);
    text(`CHAMBER ${s.roomId % 8 + 1}`, 550, 10, color.muted, 8, "right");
    rect(8, 16, 544, 2, color.pink);
    rect(8, 16, 2, 124, color.pink); rect(550, 16, 2, 124, color.pink);
    rect(8, 170, 2, 90, color.pink); rect(550, 170, 2, 90, color.pink);
    if (r.exits.left === undefined && s.roomId !== 0) rect(8, 140, 2, 30, color.pink);
    else text(s.roomId === 0 ? "OUT" : "<", 13, 135, s.roomId === 0 ? color.green : color.orange, 8);
    if (r.exits.right === undefined) rect(550, 140, 2, 30, color.pink);
    else text(">", 538, 135, color.orange, 8);
    for (const p of r.platforms) {
      rect(p.x1, E.FLOORS[p.tier], p.x2 - p.x1, 2, color.pink);
      if (p.fragile) {
        for (let x = p.x1 + 4; x < p.x2; x += 8) rect(x, E.FLOORS[p.tier], 2, 2, "#000");
        rect(p.x1, E.FLOORS[p.tier] + 3, p.x2 - p.x1, 1, color.dark);
      }
    }
    for (const stair of r.stairs) {
      for (let i = 0; i < 16; i++) {
        const progress = i / 15;
        const x = stair.x1 + (stair.x2 - stair.x1) * progress;
        const y = E.FLOORS[stair.top] + (E.FLOORS[stair.bottom] - E.FLOORS[stair.top]) * progress;
        rect(x - 4, y, 9, 2, i % 3 === 0 ? color.white : color.green);
      }
    }
    for (const direction of ["up", "down"]) {
      if (r.exits[direction] === undefined) continue;
      const y = direction === "up" ? E.FLOORS[0] : E.FLOORS[2];
      rect(274, y - 31, 2, 28, color.orange); rect(286, y - 31, 2, 28, color.orange);
      for (let i = 0; i < 4; i++) rect(274, y - 29 + i * 7, 14, 1, color.orange);
      text(direction === "up" ? "UP" : "DN", 280, y - 38, color.orange, 8, "center");
    }
    for (const w of r.walls) {
      if (!w.intact) { rect(w.x - 3, E.FLOORS[w.tier] - 3, 18, 3, color.orange); continue; }
      for (let i = 0; i < 5; i++) {
        rect(w.x, E.FLOORS[w.tier] - 30 + i * 6, 10, 4, color.orange);
        rect(w.x + (i % 2 ? 3 : 7), E.FLOORS[w.tier] - 30 + i * 6, 1, 4, "#000");
      }
    }
    if (r.hazard) {
      const h = r.hazard, y = E.FLOORS[h.tier];
      if (h.type === "spikes") {
        for (let x = h.x; x < h.x + h.width; x += 8) {
          rect(x, y - 2, 7, 2, color.orange); rect(x + 2, y - 5, 3, 3, color.orange); rect(x + 3, y - 7, 1, 2, color.white);
        }
      } else {
        const drop = Math.max(0, Math.sin(s.time * 1.6 + h.phase)) * 55;
        rect(h.x, y - 75 + drop, h.width, 6, color.orange);
        rect(h.x + 4, y - 80, 2, drop, color.muted); rect(h.x + h.width - 6, y - 80, 2, drop, color.muted);
      }
    }
    for (const item of r.loot) {
      const y = E.FLOORS[item.tier];
      if (item.taken) {
        rect(item.x - 9, y - 3, 18, 2, color.dark);
      } else if (item.item === "idol" && item.looked) {
        sprite(sprites.idol, item.x - 7, y, 2);
      } else if (item.kind === "chest") {
        sprite(sprites.chest, item.x - 7, y, 2);
        if (item.layers === 0) rect(item.x - 8, y - 15, 16, 2, color.orange);
      } else {
        sprite(sprites.rubble, item.x - 14, y, 2);
        if (item.layers === 0) rect(item.x - 3, y - 12, 6, 6, color.orange);
      }
    }
    for (const e of r.enemies) {
      if (e.hp <= 0) continue;
      if (e.type === "guardian") person({ ...e, motion: "walk" }, s.time, true);
      else sprite(sprites[e.type], e.x - 12, e.y, 2, e.dir === -1);
    }
    for (const b of s.bombs) {
      if (b.roomId !== s.roomId) continue;
      rect(b.x - 2, b.y - 7, 4, 7, color.orange);
      rect(b.x, b.y - 10, 1, 3, color.white);
      if (!reducedMotion.matches && Math.floor(s.time * 12) % 2) rect(b.x - 1, b.y - 12, 3, 2, color.orange);
    }
    for (const shot of s.projectiles) rect(shot.x - 3, shot.y, 7, 1, shot.enemy ? color.orange : color.white);
    person(s.player, s.time);
    for (const effect of s.effects) {
      if (effect.roomId !== s.roomId) continue;
      if (effect.kind === "hit" || reducedMotion.matches) {
        rect(effect.x - 5, effect.y, 10, 2, color.orange);
      } else {
        const radius = (0.5 - effect.life) * 100;
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          rect(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius, 4, 3, i % 2 ? color.orange : color.white);
        }
      }
    }
    drawHud(s);
  }

  function drawHud(s) {
    const inv = s.inventory, p = s.player;
    rect(8, 271, 544, 1, color.pink);
    text("STRENGTH", 12, 285, color.muted, 8);
    for (let i = 0; i < 5; i++) {
      rect(66 + i * 9, 278, 6, 8, i < p.strength ? color.green : color.dark);
    }
    text("BULLETS " + String(inv.ammo).padStart(2, "0"), 125, 285, color.white, 9);
    text("DYNAMITE " + inv.dynamite, 224, 285, color.orange, 9);
    text(inv.idol ? "JADE: RECOVERED" : "JADE: MISSING", 338, 285, inv.idol ? color.green : color.muted, 9);
    text(inv.machete ? "MACHETE" : "", 12, 303, color.white, 9);
    text(inv.pistol ? "PISTOL" : "NO PISTOL", 83, 303, inv.pistol ? color.white : color.muted, 9);
    const mode = p.climbing ? "CLIMB" : p.fight ? (p.drawn ? "PISTOL" : "FIGHT") : touchUsed || keyboard === "modern" ? "ARROWS" : p.motion.toUpperCase();
    text(mode, 181, 303, color.green, 9);
    const minutes = Math.floor(s.time / 60), seconds = Math.floor(s.time % 60);
    text(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`, 263, 303, color.white, 9);
    const clue = inv.idol ? "RETURN D1 / C1" : inv.clue ? `IDOL D${Math.floor(s.idolRoom / 8) + 1} / C${s.idolRoom % 8 + 1}` : "SEARCH FOR A SURVEY";
    text(clue, 338, 303, inv.idol ? color.green : color.muted, 8);
    for (const r of s.rooms) {
      const fill = r.id === s.roomId ? color.white : r.id === 0 ? color.green : r.visited ? color.pink : color.dark;
      rect(510 + (r.id % 8) * 5, 277 + Math.floor(r.id / 8) * 5, 3, 3, fill);
    }
  }

  function drawMap() {
    if (!state) return;
    const m = $("map-canvas").getContext("2d");
    m.fillStyle = "#000"; m.fillRect(0, 0, 256, 256);
    for (const r of state.rooms) {
      const x = 16 + r.id % 8 * 32, y = 16 + Math.floor(r.id / 8) * 32;
      if (r.visited) {
        m.strokeStyle = color.pink; m.lineWidth = 2;
        for (const next of Object.values(r.exits)) {
          m.beginPath(); m.moveTo(x, y); m.lineTo(16 + next % 8 * 32, 16 + Math.floor(next / 8) * 32); m.stroke();
        }
      }
      m.fillStyle = r.id === state.roomId ? color.white : r.id === 0 ? color.green :
        state.inventory.clue && r.id === state.idolRoom ? color.orange : r.visited ? color.pink : color.dark;
      m.fillRect(x - 6, y - 6, 12, 12);
      if (r.id === state.roomId) { m.strokeStyle = color.white; m.strokeRect(x - 9, y - 9, 18, 18); }
    }
    const inv = state.inventory, r = state.rooms[state.roomId];
    $("map-description").textContent = `You are at depth ${Math.floor(r.id / 8) + 1}, chamber ${r.id % 8 + 1}. Exits: ${Object.keys(r.exits).join(", ")}${r.id === 0 ? ", entrance to the left" : ""}. ${state.roomsVisited} of 64 chambers explored. ` +
      (inv.clue ? `The survey places the idol at depth ${Math.floor(state.idolRoom / 8) + 1}, chamber ${state.idolRoom % 8 + 1}, upper tier.` : "Search chests or debris for a survey locating the idol.");
    $("inventory-description").textContent = `Strength ${state.player.strength}/5. Machete. ${inv.pistol ? "Pistol" : "No pistol"}. ${inv.ammo} rounds. ${inv.dynamite} dynamite. ${inv.idol ? "Jade idol recovered." : "Idol not recovered."} Seed: ${state.seed}. Difficulty: ${state.difficulty}.`;
  }

  function clearInput() { held.clear(); pointers.clear(); if (state) E.command(state, "stop"); }
  function focusGame() { canvas.focus({ preventScroll: true }); }

  function updateUi() {
    if (!state) return;
    const message = state.messageTime > 0 ? state.message : state.inventory.idol ?
      "RETURN TO DEPTH 1, CHAMBER 1. LEAVE LEFT." : "EXPLORE. SEARCH. WATCH YOUR WAY BACK.";
    if (lastAnnouncement !== message) {
      $("message").textContent = message;
      lastAnnouncement = message;
    }
    $("objective").textContent = state.inventory.idol ? "RETURN TO THE ENTRANCE" : state.inventory.clue ?
      `IDOL D${Math.floor(state.idolRoom / 8) + 1} / C${state.idolRoom % 8 + 1}` : "FIND A SURVEY";
    $("accessible-status").textContent = `STR ${state.player.strength}/5  |  AMMO ${state.inventory.ammo}  |  TNT ${state.inventory.dynamite}  |  D${Math.floor(state.roomId / 8) + 1}/C${state.roomId % 8 + 1}`;
    canvas.setAttribute("aria-label", `Aztec. Depth ${Math.floor(state.roomId / 8) + 1}, chamber ${state.roomId % 8 + 1}. Strength ${state.player.strength} of 5. ${state.inventory.ammo} bullets. ${state.inventory.dynamite} dynamite. ${state.inventory.idol ? "Idol recovered; return to entrance." : "Find the idol."} ${state.paused ? "Paused." : ""}`);
    if (state.status !== "playing" && !ended) {
      ended = true; clearInput();
      $("ending").hidden = false; $("paused").hidden = true;
      $("end-title").textContent = state.status === "won" ? "BACK INTO DAYLIGHT" : "LOST IN THE TOMB";
      $("end-text").textContent = state.status === "won" ?
        `The jade idol is safe. Reward: ${state.score.toLocaleString("en-US")}. ${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s, difficulty ${state.difficulty}, ${state.roomsVisited} chambers explored.` :
        `Your expedition ends at depth ${Math.floor(state.roomId / 8) + 1}. Retry the same seed to use what you learned, or begin a different tomb.`;
      $("pause-button").disabled = true;
      $("retry").focus({ preventScroll: true });
    }
  }

  function start(seed, difficulty) {
    clearInput();
    state = E.createGame({ seed, difficulty });
    keyboard = $("controls").value;
    touchUsed = false; ended = false; lastAnnouncement = ""; accumulator = 0;
    $("setup").hidden = true; $("ending").hidden = true; $("paused").hidden = true;
    $("accessible-status").hidden = false;
    $("new-button").hidden = false; $("pause-button").disabled = false; $("map-button").disabled = false;
    $("pause-button").textContent = "Pause"; $("pause-button").setAttribute("aria-pressed", "false");
    $("key-strip").innerHTML = keyboard === "classic" ?
      "<span><kbd>W</kbd> walk &nbsp; <kbd>R</kbd> run &nbsp; <kbd>S</kbd> stop &nbsp; <kbd>A D</kbd> turn</span><span><kbd>C</kbd> climb &nbsp; <kbd>O L T</kbd> search &nbsp; <kbd>F</kbd> fight &nbsp; <kbd>?</kbd> help</span>" :
      "<span><kbd>ARROWS</kbd> move / climb &nbsp; <kbd>SPACE</kbd> jump &nbsp; <kbd>E</kbd> search</span><span><kbd>X</kbd> slash &nbsp; <kbd>Z</kbd> shoot &nbsp; <kbd>B</kbd> dynamite &nbsp; <kbd>?</kbd> help</span>";
    updateUi(); focusGame();
  }

  function pause(value = !state?.paused) {
    if (!state || state.status !== "playing" || !$("setup").hidden) return;
    clearInput(); E.setPaused(state, value);
    $("paused").hidden = !value;
    $("pause-button").textContent = value ? "Resume" : "Pause";
    $("pause-button").setAttribute("aria-pressed", String(value));
    if (value) $("resume").focus({ preventScroll: true }); else focusGame();
    updateUi();
  }

  function openModal(id) {
    if ($(id).open) return;
    clearInput(); modalWasPaused = Boolean(state?.paused);
    modalId = id;
    if (state) E.setPaused(state, true);
    if (id === "map") drawMap();
    $(id).showModal();
  }

  function closeModal(id) {
    if (modalId !== id) return;
    modalId = null;
    $(id).close();
    if (state) E.setPaused(state, modalWasPaused);
    if (state && $("setup").hidden) focusGame();
  }

  function newExpedition() {
    clearInput();
    if (state) E.setPaused(state, true);
    $("setup").hidden = false; $("paused").hidden = true; $("ending").hidden = true;
    $("cancel-new").hidden = !state || state.status !== "playing";
    $("pause-button").disabled = true; $("map-button").disabled = true; $("new-button").hidden = true;
    $("difficulty").focus({ preventScroll: true });
  }

  function tone(event) {
    if (!soundOn || !audio || audio.state !== "running") return;
    const notes = { jump: 260, search: 180, loot: 550, shot: 90, swing: 140, hit: 110, hurt: 65, fuse: 340, blast: 42, idol: 880, win: 660, dead: 55 };
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = "square"; oscillator.frequency.value = notes[event] || 200;
    gain.gain.setValueAtTime(0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + 0.13);
  }

  function playAction(action) {
    if (!state || !$("setup").hidden || $("help").open || $("map").open) return;
    E.command(state, action);
    updateUi();
  }

  function onKey(event) {
    const tag = event.target.tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if ($("help").open || $("map").open) return;
    if (event.key === "?") { event.preventDefault(); openModal("help"); return; }
    if (!state || !$("setup").hidden || state.status !== "playing") return;
    if (event.key === "Escape") { event.preventDefault(); if (!event.repeat) pause(); return; }
    // Keep Tab's native focus order; inventory uses I (and classic Z).
    if (event.key.toLowerCase() === "i" || (keyboard === "classic" && event.key.toLowerCase() === "z")) {
      event.preventDefault(); if (!event.repeat) openModal("map"); return;
    }
    if (state.paused || tag === "BUTTON" || tag === "A") return;
    const key = event.key.toLowerCase();
    const modernActions = { " ": "jump", arrowup: "up", arrowdown: "down", e: "search", x: "slash", z: "fire", b: "bomb" };
    const p = state.player;
    const classicActions = {
      w: "walk", r: "run", s: p.fight ? "spin" : "stop",
      a: p.fight ? "stepLeft" : "faceLeft", d: p.fight ? "stepRight" : "faceRight",
      j: "jump", g: p.fight ? "draw" : "crawl", c: "climb", o: "open",
      l: p.fight ? "lunge" : "look", t: "take", f: "fight", m: "slash", p: "bomb",
      " ": p.fight && p.drawn ? "fire" : "jump"
    };
    const action = keyboard === "modern" ? modernActions[key] : classicActions[key];
    if (action || (keyboard === "modern" && ["arrowleft", "arrowright"].includes(key))) {
      event.preventDefault();
      touchUsed = false;
      held.add(event.key);
      if (action && !event.repeat) playAction(action);
    }
  }

  $("start-form").addEventListener("submit", event => {
    event.preventDefault();
    const seed = $("seed").value.trim().toUpperCase() ||
      Array.from(crypto.getRandomValues(new Uint8Array(4)), n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    start(seed, Number($("difficulty").value));
  });
  $("pause-button").addEventListener("click", () => pause());
  $("resume").addEventListener("click", () => pause(false));
  $("help-button").addEventListener("click", () => openModal("help"));
  $("map-button").addEventListener("click", () => openModal("map"));
  $("new-button").addEventListener("click", newExpedition);
  $("new-tomb").addEventListener("click", newExpedition);
  $("retry").addEventListener("click", () => start(state.seed, state.difficulty));
  $("cancel-new").addEventListener("click", () => {
    $("setup").hidden = true; $("new-button").hidden = false;
    $("pause-button").disabled = false; $("map-button").disabled = false;
    pause(false);
  });
  for (const dialog of [$("help"), $("map")]) {
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeModal(dialog.id); });
    dialog.addEventListener("close", () => closeModal(dialog.id));
  }
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
  $("sound").addEventListener("click", async () => {
    if (!soundOn) {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error("Web Audio is not available in this browser.");
        audio ||= new Audio();
        await audio.resume();
        soundOn = true;
      } catch (error) {
        console.error("Could not enable game audio:", error);
        $("message").textContent = "Sound unavailable. Play continues silently.";
        return;
      }
    } else soundOn = false;
    $("sound").textContent = soundOn ? "Sound on" : "Sound off";
    $("sound").setAttribute("aria-pressed", String(soundOn));
    if (soundOn) tone("loot");
    if (state && $("setup").hidden) focusGame();
  });
  document.querySelectorAll(".touch button").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      if (!state || state.paused || state.status !== "playing" || !$("setup").hidden) return;
      touchUsed = true;
      button.setPointerCapture(event.pointerId);
      if (button.dataset.hold) pointers.set(event.pointerId, button.dataset.hold);
      if (button.dataset.action) playAction(button.dataset.action);
      if (button.dataset.action === "stop") clearInput();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(name, event => pointers.delete(event.pointerId));
    }
    // Keyboard activation of an on-screen action must work without pointer input.
    button.addEventListener("click", event => {
      if (event.detail === 0 && button.dataset.action) playAction(button.dataset.action);
    });
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", event => held.delete(event.key));
  window.addEventListener("blur", () => {
    clearInput();
    if (state && !$("help").open && !$("map").open) pause(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInput();
      if (state && !$("help").open && !$("map").open) pause(true);
    }
  });
  canvas.addEventListener("pointerdown", focusGame);

  function frame(now) {
    const elapsed = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;
    if (state && !state.paused && state.status === "playing" && $("setup").hidden) {
      accumulator += elapsed;
      const touch = new Set(pointers.values());
      const input = {
        modern: touchUsed || keyboard === "modern",
        left: held.has("ArrowLeft") || touch.has("left"),
        right: held.has("ArrowRight") || touch.has("right"),
        duck: held.has("ArrowDown") || touch.has("duck")
      };
      while (accumulator >= E.STEP) { E.tick(state, input); accumulator -= E.STEP; }
      for (const event of state.events.splice(0, 4)) tone(event);
    } else accumulator = 0;
    drawRoom(state || preview);
    if (++uiCounter % 8 === 0 || state && state.status !== "playing" && !ended) updateUi();
    requestAnimationFrame(frame);
  }
  // Observation only: automation can inspect real gameplay without altering a run.
  window.aztec = Object.freeze({ snapshot: () => state ? JSON.parse(JSON.stringify(state)) : null });
  requestAnimationFrame(frame);
})();
