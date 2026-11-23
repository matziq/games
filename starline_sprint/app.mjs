import {STEP, PLAYER_X, PLAYER_SIZE, CEILING, LEVELS, newRun, jump, advance, defaultSave, restoreSave, hazardPolygons, playerName, recordScore} from "./game.mjs";
import {createMusic} from "./audio.mjs";

const $ = id => document.getElementById(id);
const canvas = $("canvas"), ctx = canvas.getContext("2d"), key = "starline-sprint.v1";
let data = defaultSave(), lastTime = 0, accumulator = 0, saveTicks = 0, lastDisplay = "";
let lastScores = "";
function warn(id, text) { $(id).textContent = text; $(id).hidden = false; }
try {
  const saved = localStorage.getItem(key);
  if (saved !== null) data = restoreSave(JSON.parse(saved));
} catch {
  warn("storage-warning","Saved progress could not be loaded. Browser storage may be unavailable or the save may be invalid.");
}
const music = createMusic(() => warn("audio-warning","Sound is unavailable or blocked by this browser. You can still play."));
$("player-name").value = data.profile.name;
$("avatar").value = data.profile.avatar;
const levelButtons = LEVELS.map((item, index) => {
  const button = document.createElement("button"), name = document.createElement("span"), detail = document.createElement("small");
  button.type = "button"; button.className = "level"; name.textContent = `${index + 1}. ${item.name}`;
  button.append(name,detail); button.addEventListener("click",() => selectLevel(index));
  return button;
});
$("levels").append(...levelButtons);
function save() {
  try { localStorage.setItem(key,JSON.stringify(data)); }
  catch { warn("storage-warning","Progress could not be saved on this browser. You can play, but progress may be lost when you leave."); }
}
function percent(value, level) { return Math.min(100,Math.floor(value / level.length * 100)); }
function display() {
  const run = data.run, level = LEVELS[run.level], pc = percent(run.distance,level);
  $("course-title").textContent = level.name;
  $("best").textContent = `${percent(data.best[run.level],level)}%`;
  $("percent").textContent = `${pc}%`;
  $("progress").value = pc;
  $("start").textContent = run.phase === "paused" ? "Resume" : "Start run";
  $("start").disabled = !["ready","paused"].includes(run.phase);
  $("jump").disabled = run.phase !== "running";
  $("pause").disabled = run.phase !== "running";
  $("retry").disabled = run.phase === "ready";
  $("next").hidden = run.phase !== "complete" || run.level === LEVELS.length - 1;
  const messages = {
    ready:["READY WHEN YOU ARE","Start your run, then tap or press Space to jump.","Ready to run."],
    paused:["PAUSED","Your run is saved. Resume when you are ready.","Paused. Your run is saved."],
    crashed:["NICE TRY","You hit a hazard. Retry and find your rhythm.","Run ended. Choose Retry to try again."],
    complete:["COURSE CLEARED",run.level === LEVELS.length - 1 ? "All fifteen courses complete. You did it!" : "Great run! The next course is unlocked.",
      run.level === LEVELS.length - 1 ? "All fifteen courses complete!" : "Course complete. The next course is unlocked."],
    running:["","",`Running. Gravity: ${run.gravity === 1 ? "floor" : "ceiling"}. Tap or press Space to jump.`]
  };
  const message = messages[run.phase];
  $("overlay").hidden = run.phase === "running";
  $("overlay-kicker").textContent = message[0]; $("overlay-message").textContent = message[1];
  if ($("status").textContent !== message[2]) $("status").textContent = message[2];
  $("mute").textContent = data.options.muted ? "Unmute" : "Mute";
  $("mute").setAttribute("aria-pressed",String(data.options.muted));
  $("volume").value = Math.round(data.options.volume * 100);
  $("volume-value").textContent = `${Math.round(data.options.volume * 100)}%`;
  const scoreKey = JSON.stringify(data.scores);
  if (scoreKey !== lastScores) {
    $("scores").replaceChildren(...data.scores.map(entry => {
      const item = document.createElement("li");
      item.textContent = `${entry.name} — ${entry.points.toLocaleString("en-US")} points · ${LEVELS[entry.level].name} · ${entry.percent}%${entry.complete ? " cleared" : ""}`;
      return item;
    }));
    $("no-scores").hidden = data.scores.length > 0;
    lastScores = scoreKey;
  }
  levelButtons.forEach((button,index) => {
    button.disabled = index > data.unlocked;
    if (index === run.level) button.setAttribute("aria-current","true"); else button.removeAttribute("aria-current");
    button.lastElementChild.textContent = index > data.unlocked ? "Locked" : `Best ${percent(data.best[index],LEVELS[index])}%`;
  });
}
function selectLevel(index) {
  if (index > data.unlocked || index === data.run.level) return;
  if (["running","paused"].includes(data.run.phase) && data.run.distance > 0 &&
      !confirm("Change courses? The current run will be restarted.")) return;
  music.silence(); data.run = newRun(index); accumulator = 0; lastTime = 0; save(); display();
}
function start() {
  if (!["ready","paused"].includes(data.run.phase)) return;
  data.run.phase = "running"; accumulator = 0; lastTime = 0;
  music.activate(data.options); save(); display(); canvas.focus({preventScroll:true});
}
function pause() {
  if (data.run.phase !== "running") return;
  data.run.phase = "paused"; accumulator = 0; lastTime = 0;
  music.silence(); save(); display();
}
function retry() {
  if (data.run.phase === "ready") return;
  if (["running","paused"].includes(data.run.phase) && data.run.distance > 0 &&
      !confirm("Restart this course? Current run progress will be lost.")) return;
  music.silence(); data.run = newRun(data.run.level); accumulator = 0; lastTime = 0; save(); display();
}
function doJump() {
  if (jump(data.run)) save();
}
$("start").addEventListener("click",start);
$("pause").addEventListener("click",pause);
$("retry").addEventListener("click",retry);
$("jump").addEventListener("click",doJump);
$("player-name").addEventListener("input",event => { data.profile.name = playerName(event.target.value); save(); });
$("player-name").addEventListener("change",event => { event.target.value = data.profile.name; });
$("avatar").addEventListener("change",event => { data.profile.avatar = event.target.value; save(); });
$("next").addEventListener("click",() => selectLevel(data.run.level + 1));
canvas.addEventListener("pointerdown",() => { if (data.run.phase === "ready") start(); else doJump(); });
$("mute").addEventListener("click",() => {
  data.options.muted = !data.options.muted;
  music.configure(data.options,data.run.phase === "running");
  if (!data.options.muted && data.run.phase === "running") music.activate(data.options);
  save(); display();
});
$("volume").addEventListener("input",event => {
  data.options.volume = Number(event.target.value) / 100;
  music.configure(data.options,data.run.phase === "running"); save();
  $("volume-value").textContent = `${Math.round(data.options.volume * 100)}%`;
});
window.addEventListener("keydown",event => {
  if (event.target.closest("input,select,textarea,[contenteditable=true]")) return;
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    if (event.target.closest("button,a")) return;
    event.preventDefault();
    if (!event.repeat) { if (data.run.phase === "ready") start(); else doJump(); }
  } else if (event.code === "KeyP" && !event.repeat) {
    event.preventDefault();
    if (data.run.phase === "running") pause(); else if (data.run.phase === "paused") start();
  }
});
document.addEventListener("visibilitychange",() => { if (document.hidden) pause(); });
window.addEventListener("pagehide",() => { if (data.run.phase === "running") data.run.phase = "paused"; music.silence(); save(); });

function draw() {
  const run = data.run, level = LEVELS[run.level], rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const width = Math.max(1,Math.round(rect.width*dpr)), height = Math.max(1,Math.round(rect.height*dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const viewWidth = window.matchMedia("(max-width:650px)").matches ? 600 : 960;
  ctx.setTransform(width/viewWidth,0,0,height/400,0,0);
  const bg = ctx.createLinearGradient(0,0,0,400);
  bg.addColorStop(0,level.colors[0]); bg.addColorStop(1,level.colors[1]);
  ctx.fillStyle = bg; ctx.fillRect(0,0,viewWidth,400);
  ctx.fillStyle = "#ffffff90";
  for (let i=0;i<38;i++) {
    const span = viewWidth+60, x = ((i*137+59-run.distance*0.16)%span+span)%span-30, y = 22+(i*71)%195;
    ctx.fillRect(x,y,i%5===0?3:2,i%5===0?3:2);
  }
  ctx.fillStyle = "#ffffff13";
  for (let i=0;i<12;i++) {
    const span = viewWidth+140, x = ((i*156-run.distance*0.3)%span+span)%span-90;
    ctx.beginPath(); ctx.moveTo(x,314); ctx.lineTo(x+65,180+(i%3)*20); ctx.lineTo(x+130,314); ctx.fill();
  }
  const floor = 315;
  ctx.fillStyle = "#071728"; ctx.fillRect(0,floor,viewWidth,85);
  ctx.fillStyle = level.colors[2]; ctx.fillRect(0,floor,viewWidth,4);
  if (level.portals.length) {
    ctx.fillStyle = "#b8dcff99"; ctx.fillRect(0,floor-CEILING,viewWidth,3);
  }
  ctx.fillStyle = "#ffffff35";
  for (let x=-(run.distance%60);x<viewWidth;x+=60) ctx.fillRect(x,floor+24,32,2);
  for (const o of level.obstacles) {
    const x = o.x - run.distance;
    if (x + o.width < 0 || x > viewWidth) continue;
    ctx.fillStyle = "#ff7789"; ctx.strokeStyle = "#ffe4df"; ctx.lineWidth = 2;
    for (const polygon of hazardPolygons(o)) {
      ctx.beginPath();
      polygon.forEach(([px,py],index) => index ? ctx.lineTo(px-run.distance,floor-py) : ctx.moveTo(px-run.distance,floor-py));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  for (const platform of level.platforms) {
    const x = platform.x-run.distance;
    if (x + platform.width < 0 || x > viewWidth) continue;
    ctx.fillStyle = "#74e8e2"; ctx.fillRect(x,floor-platform.y-platform.height,platform.width,platform.height);
    ctx.strokeStyle = "#e3ffff"; ctx.lineWidth=2; ctx.strokeRect(x,floor-platform.y-platform.height,platform.width,platform.height);
  }
  for (const portal of level.portals) {
    const x=portal.x-run.distance;
    if (x < -40 || x > viewWidth+40) continue;
    ctx.fillStyle="#fce28a40"; ctx.fillRect(x-9,floor-CEILING,18,CEILING);
    ctx.strokeStyle="#ffe28a"; ctx.lineWidth=2; ctx.strokeRect(x-9,floor-CEILING,18,CEILING);
    ctx.fillStyle="#fff4b8"; ctx.font="bold 15px system-ui"; ctx.textAlign="center";
    ctx.fillText(portal.gravity === -1 ? "↑" : "↓",x,floor-CEILING-8);
    ctx.textAlign="start";
  }
  const py = floor-run.y-PLAYER_SIZE;
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && run.phase === "running") {
    ctx.fillStyle = "#ffffff88";
    for (let i=1;i<=4;i++) ctx.fillRect(PLAYER_X-16-i*9,py+12+Math.sin(run.ticks*.2+i)*5,4,4);
  }
  const avatar=data.profile.avatar, left=PLAYER_X-PLAYER_SIZE/2, mid=py+PLAYER_SIZE/2;
  ctx.fillStyle = {nova:"#ffe17e",orbit:"#7fe4ff",spark:"#ff9dd2",comet:"#a9f792"}[avatar];
  ctx.strokeStyle="#fff8d5"; ctx.lineWidth=2; ctx.beginPath();
  if (avatar === "orbit") ctx.arc(PLAYER_X,mid,PLAYER_SIZE/2,0,Math.PI*2);
  else if (avatar === "spark") { ctx.moveTo(PLAYER_X,py); ctx.lineTo(left+PLAYER_SIZE,mid); ctx.lineTo(PLAYER_X,py+PLAYER_SIZE); ctx.lineTo(left,mid); ctx.closePath(); }
  else if (avatar === "comet") { ctx.moveTo(left+7,py); ctx.lineTo(left+21,py); ctx.lineTo(left+28,mid); ctx.lineTo(left+21,py+28); ctx.lineTo(left+7,py+28); ctx.lineTo(left,mid); ctx.closePath(); }
  else ctx.rect(left,py,PLAYER_SIZE,PLAYER_SIZE);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#172337"; ctx.fillRect(PLAYER_X+2,py+7,4,4); ctx.fillRect(PLAYER_X+8,py+7,4,4);
  ctx.fillRect(PLAYER_X+5,py+17,6,2);
}
function loop(time) {
  if (!lastTime) lastTime = time;
  const delta = Math.min(0.1,Math.max(0,(time-lastTime)/1000)); lastTime = time;
  if (data.run.phase === "running") {
    accumulator += delta;
    while (accumulator >= STEP && data.run.phase === "running") {
      advance(data.run); accumulator -= STEP; saveTicks++;
      data.best[data.run.level] = Math.max(data.best[data.run.level],data.run.distance);
      if (data.run.phase === "complete") data.unlocked = Math.max(data.unlocked,Math.min(LEVELS.length-1,data.run.level+1));
      if (data.run.phase !== "running") { recordScore(data); music.silence(); save(); }
      if (saveTicks >= 30) { saveTicks = 0; save(); }
    }
  }
  music.update(data.run.phase === "running");
  draw();
  const displayKey = `${data.run.level}:${data.run.phase}:${data.run.gravity}:${percent(data.run.distance,LEVELS[data.run.level])}:${data.unlocked}`;
  if (displayKey !== lastDisplay) { display(); lastDisplay = displayKey; }
  requestAnimationFrame(loop);
}
display(); requestAnimationFrame(loop);
