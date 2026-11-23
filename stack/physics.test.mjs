import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { MAX_PLACEMENTS, newGame, validGame, createWorld, snapshot, addBlock, step, impactSpeed } from "./physics.mjs";
const require = createRequire(import.meta.url);
const M = require("./matter.min.js");

test("a centered block settles and an off-platform drop loses for the dropping player", () => {
  const state = newGame(() => 0), world = createWorld(M, state);
  assert.equal(addBlock(M, world, state), true);
  assert.equal(addBlock(M, world, state), false);
  for (let i = 0; i < 1000 && state.phase === "falling"; i++) step(M, world, state);
  assert.equal(state.phase, "aim");
  assert.equal(world.bodies.length, 1);
  state.aim = 50;
  assert.equal(addBlock(M, world, state), true);
  for (let i = 0; i < 1000 && state.phase !== "lost"; i++) step(M, world, state);
  assert.equal(state.phase, "lost");
  assert.equal(state.loser, 1);
});
test("moving blocks and their turns can be reconstructed from snapshots", () => {
  const state = newGame(() => 0.8), world = createWorld(M, state);
  addBlock(M, world, state);
  for (let i = 0; i < 15; i++) step(M, world, state);
  state.blocks = snapshot(world.bodies);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(validGame(restored), true);
  const rebuilt = createWorld(M, restored), [b] = rebuilt.bodies;
  assert.ok(Math.abs(b.position.y - state.blocks[0].y) < 1e-8);
  assert.ok(Math.abs(b.velocity.y - state.blocks[0].vy) < 1e-8);
  for (let i = 0; i < 1000 && restored.phase === "falling"; i++) step(M, rebuilt, restored);
  assert.equal(restored.phase, "aim");
  assert.equal(rebuilt.bodies.length, 1);
  assert.equal(MAX_PLACEMENTS, 40);
});
test("corrupt saves are rejected", () => {
  const state = newGame();
  state.queue[0] = "unknown";
  assert.equal(validGame(state), false);
});
test("legacy saves remain valid and impact detection excludes the platform", () => {
  const state = newGame();
  assert.equal(validGame(state), true);
  state.players = ["Ana", "Bo"];
  assert.equal(validGame(state), true);
  const body = (isStatic, x, y) => { const p = { isStatic, velocity: { x, y } }; p.parent = p; return p; };
  assert.equal(impactSpeed({ bodyA: body(false, 0, 4), bodyB: body(true, 0, 0) }), 0);
  assert.equal(impactSpeed({ bodyA: body(false, 0, 4), bodyB: body(false, 0, 1) }), 3);
});
test("the 40th block must settle before both players win", () => {
  const state = newGame(() => 0);
  state.blocks = Array.from({ length: 39 }, (_, i) =>
    ({ shape: "bar", x: 300, y: 986 - 28 * i, angle: 0, vx: 0, vy: 0, angularVelocity: 0 }));
  const world = createWorld(M, state);
  assert.equal(addBlock(M, world, state), true);
  assert.equal(state.phase, "falling");
  for (let i = 0; i < 5000 && state.phase === "falling"; i++) step(M, world, state);
  assert.equal(state.phase, "won");
  state.blocks = snapshot(world.bodies);
  assert.equal(validGame(JSON.parse(JSON.stringify(state))), true);
});
