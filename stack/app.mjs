import { MAX_PLACEMENTS, GROUND_Y, newGame, validGame, createWorld, makeBody, snapshot, topOf, towerHeight, addBlock, step, impactSpeed } from "./physics.mjs";
import { playerNames } from "../party_names.mjs";
import { createSounds } from "../party_audio.mjs";
const M = window.Matter;
const $ = id => document.getElementById(id);
const canvas = $("canvas"), ctx = canvas.getContext("2d"), key = "road-tower-tumble.v1";
let state = null, world, lastTime = 0, accumulator = 0, sinceSave = 0, lastDisplay = "", lastImpact = -Infinity;
const sounds = createSounds(() => { $("sound-warning").textContent = "Sound is unavailable or waiting for interaction; you can still play."; $("sound-warning").hidden = false; }, () => { $("sound-warning").hidden = true; });
function warn(text) { $("warning").textContent = text; $("warning").hidden = false; }
function save() {
  if (!state || !world) return;
  state.blocks = snapshot(world.bodies);
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { warn("Progress could not be saved on this browser. You can play, but progress may be lost when you leave."); }
}
try {
  const saved = localStorage.getItem(key);
  if (saved !== null) {
    const loaded = JSON.parse(saved);
    if (!validGame(loaded)) throw new Error("Invalid saved game");
    state = loaded;
    state.players ||= ["Player 1", "Player 2"];
  }
} catch { warn("Could not load saved progress. Browser storage may be unavailable or the saved game may be invalid."); }
function buildWorld() {
  world = createWorld(M, state);
  lastImpact = -Infinity;
  M.Events.on(world.engine, "collisionStart", event => {
    if (event.timestamp - lastImpact < 180 || !event.pairs.some(pair => impactSpeed(pair) >= 1.2)) return;
    lastImpact = event.timestamp;
    sounds.impact();
  });
}
if (state) buildWorld();
function display() {
  $("setup").hidden = !!state;
  $("game").hidden = !state;
  if (!state) return;
  const count = world.bodies.length, next = count % 2 + 1;
  const round = state.phase === "falling" || state.phase === "lost" ? Math.floor((count - 1) / 2) + 1 : Math.floor(count / 2) + 1;
  $("round").textContent = state.phase === "won" ? "20 rounds complete" : `Round ${Math.min(20, round)} of 20`;
  $("height").textContent = `Tower height: ${towerHeight(world.bodies)} units • Blocks placed: ${count} / ${MAX_PLACEMENTS}`;
  if (state.phase === "lost") $("status").textContent = `${state.players[state.loser]} caused a fall. ${state.players[1 - state.loser]} wins!`;
  else if (state.phase === "won") $("status").textContent = "The tower survived all 20 rounds. Both players win!";
  else if (state.phase === "falling") $("status").textContent = `${state.players[(count - 1) % 2]}'s block is settling…`;
  else $("status").textContent = `${state.players[next - 1]}'s turn • Next shape: ${state.queue[count]}`;
  $("aim").value = state.aim;
  $("position").textContent = `${Math.round((state.aim - 45) / 510 * 100)}%`;
  for (const id of ["aim", "left", "right", "rotate", "drop"]) $(id).disabled = state.phase !== "aim";
}
function polygon(body, opacity = 1) {
  ctx.globalAlpha = opacity;
  for (const part of body.parts.length > 1 ? body.parts.slice(1) : [body]) {
    ctx.beginPath(); part.vertices.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y));
    ctx.closePath(); ctx.fillStyle = body.render.fillStyle; ctx.fill(); ctx.strokeStyle = "#182033"; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const top = topOf(world.bodies);
  const viewTop = Math.min(GROUND_Y - 600, top - 160);
  ctx.save(); ctx.translate(0, -viewTop);
  ctx.fillStyle = "#7688a2"; ctx.fillRect(140, GROUND_Y, 320, 36);
  ctx.fillStyle = "#c4cce1"; ctx.font = "16px system-ui"; ctx.fillText("PLATFORM", 255, GROUND_Y + 24);
  world.bodies.forEach(body => polygon(body));
  if (state.phase === "aim") {
    const ghost = makeBody(M, state.queue[world.bodies.length], state.aim, top - 100, state.rotation * Math.PI / 2);
    polygon(ghost, 0.6);
    ctx.strokeStyle = "#a7eaff"; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(state.aim, top - 155); ctx.lineTo(state.aim, top - 120); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
function loop(time) {
  if (!state) { lastTime = time; requestAnimationFrame(loop); return; }
  if (!lastTime) lastTime = time;
  accumulator += Math.min(100, time - lastTime); lastTime = time;
  let changed = false;
  while (accumulator >= 1000 / 60) {
    const before = state.phase;
    step(M, world, state);
    if (before !== state.phase) { save(); changed = true; }
    accumulator -= 1000 / 60; sinceSave++;
  }
  if (sinceSave >= 30 && world.bodies.length && !["lost", "won"].includes(state.phase)) { save(); sinceSave = 0; }
  draw();
  const displayKey = `${state.phase}:${world.bodies.length}:${towerHeight(world.bodies)}:${state.aim}:${state.rotation}`;
  if (changed || displayKey !== lastDisplay) { display(); lastDisplay = displayKey; }
  requestAnimationFrame(loop);
}
function setAim(value) { if (state && state.phase === "aim") { state.aim = Math.max(45, Math.min(555, value)); save(); display(); } }
function rotate() { if (state && state.phase === "aim") { state.rotation = (state.rotation + 1) % 4; save(); display(); } }
function drop() { if (state) { sounds.activate(); if (addBlock(M, world, state)) { save(); display(); } } }
$("aim").addEventListener("input", event => setAim(Number(event.target.value)));
$("left").addEventListener("click", () => setAim(state.aim - 15));
$("right").addEventListener("click", () => setAim(state.aim + 15));
$("rotate").addEventListener("click", rotate);
$("drop").addEventListener("click", drop);
canvas.addEventListener("pointerdown", event => {
  const bounds = canvas.getBoundingClientRect();
  setAim((event.clientX - bounds.left) * canvas.width / bounds.width);
});
window.addEventListener("keydown", event => {
  if (event.target.closest("button, input, a")) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); setAim(state.aim - 15); }
  else if (event.key === "ArrowRight") { event.preventDefault(); setAim(state.aim + 15); }
  else if (event.key.toLowerCase() === "r") { event.preventDefault(); rotate(); }
  else if (event.key === " ") { event.preventDefault(); drop(); }
});
$("restart").addEventListener("click", () => {
  if (!confirm("Start a new Tower Tumble game? Current progress will be cleared.")) return;
  try { localStorage.removeItem(key); } catch { warn("Could not clear the saved game. It may return on reload."); }
  const previous = state.players;
  state = null; world = null; accumulator = 0;
  document.querySelectorAll('input[name="player"]').forEach((input, i) => { input.value = previous[i]; });
  display(); document.querySelector('input[name="player"]').focus();
});
$("setup-form").addEventListener("submit", event => {
  event.preventDefault();
  sounds.activate();
  state = newGame(); state.players = playerNames([...document.querySelectorAll('input[name="player"]')].map(input => input.value));
  buildWorld(); accumulator = 0; save(); display();
});
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
display(); requestAnimationFrame(loop);
