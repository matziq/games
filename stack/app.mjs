import { MAX_PLACEMENTS, GROUND_Y, newGame, validGame, createWorld, makeBody, snapshot, topOf, towerHeight, addBlock, step } from "./physics.mjs";
const M = window.Matter;
const $ = id => document.getElementById(id);
const canvas = $("canvas"), ctx = canvas.getContext("2d"), key = "road-tower-tumble.v1";
let state = newGame(), world, lastTime = 0, accumulator = 0, sinceSave = 0, lastDisplay = "";
function warn(text) { $("warning").textContent = text; $("warning").hidden = false; }
function save() {
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
  }
} catch { warn("Could not load saved progress. Browser storage may be unavailable or the saved game may be invalid."); }
world = createWorld(M, state);
function display() {
  const count = world.bodies.length, next = count % 2 + 1;
  const round = state.phase === "falling" || state.phase === "lost" ? Math.floor((count - 1) / 2) + 1 : Math.floor(count / 2) + 1;
  $("round").textContent = state.phase === "won" ? "20 rounds complete" : `Round ${Math.min(20, round)} of 20`;
  $("height").textContent = `Tower height: ${towerHeight(world.bodies)} units • Blocks placed: ${count} / ${MAX_PLACEMENTS}`;
  if (state.phase === "lost") $("status").textContent = `Player ${state.loser + 1} caused a fall. Player ${2 - state.loser} wins!`;
  else if (state.phase === "won") $("status").textContent = "The tower survived all 20 rounds. Both players win!";
  else if (state.phase === "falling") $("status").textContent = `Player ${(count - 1) % 2 + 1}'s block is settling…`;
  else $("status").textContent = `Player ${next}'s turn • Next shape: ${state.queue[count]}`;
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
function setAim(value) { if (state.phase === "aim") { state.aim = Math.max(45, Math.min(555, value)); save(); display(); } }
function rotate() { if (state.phase === "aim") { state.rotation = (state.rotation + 1) % 4; save(); display(); } }
function drop() { if (addBlock(M, world, state)) { save(); display(); } }
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
  state = newGame(); world = createWorld(M, state); accumulator = 0; save(); display();
});
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
display(); requestAnimationFrame(loop);
