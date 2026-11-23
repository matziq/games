import { questions } from "./questions.mjs";
import { ROUNDS, newMatch, validMatch, answer, advance, scores } from "./logic.mjs";
import { createSounds } from "../party_audio.mjs";
const $ = id => document.getElementById(id);
const key = "road-trivia.v1";
let state = null;
const sounds = createSounds(() => { $("sound-warning").textContent = "Sound is unavailable or waiting for interaction; you can still play."; $("sound-warning").hidden = false; }, () => { $("sound-warning").hidden = true; });
let confettiTimer;
function celebrate() {
  const container = $("confetti");
  container.replaceChildren(...Array.from({ length: 28 }, (_, i) => {
    const piece = document.createElement("span");
    piece.style.setProperty("--x", `${3 + Math.random() * 94}%`);
    piece.style.setProperty("--delay", `${Math.random() * 0.3}s`);
    piece.style.setProperty("--color", ["#a7eaff", "#f7bf5c", "#fb83a7", "#93e6a8"][i % 4]);
    return piece;
  }));
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => container.replaceChildren(), 2400);
}
function setPlayerCount() {
  document.querySelectorAll('input[name="player"]').forEach((input, i) => {
    input.parentElement.hidden = i >= Number($("player-count").value);
  });
}
function warn(text) { $("warning").textContent = text; $("warning").hidden = false; }
function save() {
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { warn("Progress could not be saved on this browser. You can play, but progress may be lost when you leave."); }
}
try {
  const saved = localStorage.getItem(key);
  if (saved !== null) {
    const loaded = JSON.parse(saved);
    if (!validMatch(loaded)) throw new Error("Invalid saved match");
    state = loaded;
  }
} catch { warn("Could not load saved progress. Browser storage may be unavailable or the saved game may be invalid."); }
function render() {
  $("setup").hidden = !!state;
  $("match").hidden = !state;
  if (!state) return;
  const total = state.order.length, done = state.cursor === total, points = scores(state);
  const difficulty = state.difficulty ? state.difficulty[0].toUpperCase() + state.difficulty.slice(1) : "Classic";
  $("round").textContent = done ? `${difficulty} • ${ROUNDS} rounds complete` : `${difficulty} • Round ${Math.floor(state.cursor / state.players.length) + 1} of ${ROUNDS}`;
  $("scores").replaceChildren(...state.players.map((name, i) => {
    const li = document.createElement("li"); li.textContent = `${name}: ${points[i]}`; return li;
  }));
  $("play").hidden = done;
  $("finished").hidden = !done;
  if (done) {
    const best = Math.max(...points), winners = state.players.filter((_, i) => points[i] === best);
    $("result").textContent = winners.length === 1 ? `${winners[0]} wins with ${best} points!` : `Tie: ${winners.join(", ")} with ${best} points each.`;
    return;
  }
  const q = questions[state.order[state.cursor]], answered = state.answers.length > state.cursor;
  $("turn").textContent = `${state.players[state.cursor % state.players.length]}'s turn`;
  $("category").textContent = q[0];
  $("question").textContent = q[1];
  $("choices").replaceChildren(...state.choices[state.cursor].map(index => {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = q[index + 2]; button.disabled = answered;
    button.addEventListener("click", () => {
      if (answer(state, index)) {
        if (index === 0) celebrate(); else sounds.sad();
        save(); render(); $("next").focus();
      }
    });
    return button;
  }));
  $("feedback").hidden = !answered;
  $("next").hidden = !answered;
  if (answered) {
    const selected = state.answers[state.cursor];
    $("feedback").textContent = selected === 0 ? `Correct! ${q[2]}` : `Not quite. The answer is ${q[2]}.`;
    $("next").textContent = state.cursor + 1 === total ? "See final scores" : "Next turn";
  }
}
$("setup-form").addEventListener("submit", event => {
  event.preventDefault();
  try { state = newMatch([...document.querySelectorAll('input[name="player"]')].slice(0, Number($("player-count").value)).map(input => input.value), $("difficulty").value); }
  catch (error) { warn(error.message); return; }
  save(); render();
});
$("next").addEventListener("click", () => { if (advance(state)) { save(); render(); } });
$("restart").addEventListener("click", () => {
  if (!confirm("Start a new trivia game? Current progress and scores will be cleared.")) return;
  try { localStorage.removeItem(key); } catch { warn("Could not clear the saved game. It may return on reload."); }
  state = null; render(); document.querySelector('input[name="player"]').focus();
});
$("player-count").addEventListener("change", setPlayerCount);
setPlayerCount();
render();
