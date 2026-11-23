import { test } from "node:test";
import assert from "node:assert/strict";
import { questions, difficultyRanges } from "./questions.mjs";
import { ROUNDS, newMatch, validMatch, answer, advance, scores } from "./logic.mjs";

test("a four-player match has 80 unique questions and exactly 20 turns each", () => {
  assert.ok(questions.length >= 80);
  assert.equal(new Set(questions.map(q => q[1])).size, questions.length);
  for (const q of questions) assert.equal(new Set(q.slice(2)).size, 4);
  const state = newMatch(["Ada", "Bea", "Cal", "Dee"], "medium", () => 0.37);
  assert.equal(new Set(state.order).size, 80);
  for (let i = 0; i < 80; i++) {
    assert.equal(answer(state, i % 4 === 0 ? 0 : 1), true);
    assert.equal(answer(state, 0), false);
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(validMatch(restored), true);
    assert.equal(advance(state), true);
  }
  assert.equal(state.cursor, 4 * ROUNDS);
  assert.deepEqual(scores(state), [20, 0, 0, 0]);
  assert.equal(answer(state, 0), false);
  assert.equal(advance(state), false);
  assert.equal(validMatch(JSON.parse(JSON.stringify(state))), true);
});
test("each difficulty supplies 80 unique questions and blank names default", () => {
  for (const [level, [start, end]] of Object.entries(difficultyRanges)) {
    assert.ok(end - start >= 80, `${level} has too few questions`);
    const state = newMatch(["", "B", "", "D"], level, () => 0.5);
    assert.deepEqual(state.players, ["Player 1", "B", "Player 3", "D"]);
    assert.equal(new Set(state.order).size, 80);
    assert.ok(state.order.every(i => i >= start && i < end));
    assert.equal(validMatch(JSON.parse(JSON.stringify(state))), true);
  }
});
test("classic saved matches still load without a difficulty", () => {
  const state = newMatch(["A"], "medium");
  delete state.difficulty;
  assert.equal(validMatch(state), true);
});
test("rejects malformed saved games and invalid player counts", () => {
  assert.throws(() => newMatch([]));
  assert.throws(() => newMatch(["1", "2", "3", "4", "5"]));
  const state = newMatch(["A"]);
  state.order[1] = state.order[0];
  assert.equal(validMatch(state), false);
});
