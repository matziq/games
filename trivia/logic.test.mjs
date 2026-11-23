import { test } from "node:test";
import assert from "node:assert/strict";
import { questions } from "./questions.mjs";
import { ROUNDS, newMatch, validMatch, answer, advance, scores } from "./logic.mjs";

test("a four-player match has 80 unique questions and exactly 20 turns each", () => {
  assert.ok(questions.length >= 80);
  assert.equal(new Set(questions.map(q => q[1])).size, questions.length);
  for (const q of questions) assert.equal(new Set(q.slice(2)).size, 4);
  const state = newMatch(["Ada", "Bea", "Cal", "Dee"], () => 0.37);
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
test("rejects malformed saved games and invalid player counts", () => {
  assert.throws(() => newMatch([]));
  assert.throws(() => newMatch(["1", "2", "3", "4", "5"]));
  const state = newMatch(["A"]);
  state.order[1] = state.order[0];
  assert.equal(validMatch(state), false);
});
