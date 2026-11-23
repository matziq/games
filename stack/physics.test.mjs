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
test("a supported jittering tower settles after resume without losing the players or advancing twice", () => {
  const state = newGame(() => 0);
  state.queue.splice(0, 4, "square", "ell", "tee", "short");
  state.players = ["Ada", "Bo"];
  state.blocks = [
    {shape:"square",x:286.0684849476308,y:972.0236521551357,angle:3.146489074425575,vx:0.010605105481147348,vy:-0.005065624825647319,angularVelocity:0.0002248500754098437},
    {shape:"ell",x:363.74933650307213,y:972.0291700929588,angle:2.0286445560065682,vx:0,vy:0,angularVelocity:0},
    {shape:"tee",x:297.86379069882855,y:909.0424773115012,angle:0.024804687686155714,vx:-0.05775113973788848,vy:0.026388474455643518,angularVelocity:-0.0021150303382513023},
    {shape:"short",x:310.00234024454505,y:846.3908261677389,angle:1.5906970685553596,vx:-0.20635703352979817,vy:-0.0000086185738155109,angularVelocity:-0.002490377318956405}
  ];
  state.phase = "falling"; state.ticks = 2400; state.quiet = 0;
  const world = createWorld(M, JSON.parse(JSON.stringify(state)));
  for (let i = 0; i < 600 && state.phase === "falling"; i++) step(M, world, state);
  assert.equal(state.phase, "aim");
  assert.deepEqual(state.players, ["Ada", "Bo"]);
  assert.equal(world.bodies.length, 4);
  assert.equal(addBlock(M, world, state), true);
  assert.equal(addBlock(M, world, state), false);
});
test("a recording-like tower with small sustained oscillations settles, including after reload", () => {
  const saved = newGame(() => 0);
  saved.players = ["Ada", "Bo"];
  saved.blocks = [
    {shape:"short",x:333.7299479756504,y:931.1430239098147,angle:1.571608019885842,vx:0.0028985844017006455,vy:-0.006716720047406852,angularVelocity:-0.00018924784508999437},
    {shape:"bar",x:301.8578969016671,y:916.4291018379852,angle:1.5689249604076634,vx:0.0060642198915593325,vy:0.012697036983445287,angularVelocity:-0.00012388485914561898},
    {shape:"short",x:298.7765833999962,y:986.7727329889312,angle:0.0008362757414579391,vx:-0.008828833743464201,vy:-0.0074048005649819965,angularVelocity:0.000023693542112596335},
    {shape:"bar",x:362.07795032933353,y:944.2607882952318,angle:1.5704262019090842,vx:-0.008859637475106865,vy:-0.010986213069409131,angularVelocity:0.00017954468249808999},
    {shape:"ell",x:242.36907059140503,y:940.615012842603,angle:0.00020344091579318048,vx:0.010759744013193994,vy:-0.01001439908053726,angularVelocity:-0.00017579153494443745},
    {shape:"ell",x:211.64132895469666,y:968.1671708283945,angle:-0.0019400605689734222,vx:0.012192760545294732,vy:0.011828695898875594,angularVelocity:-0.00021461474860552698}
  ];
  saved.blocks.forEach((b, i) => { saved.queue[i] = b.shape; });
  saved.phase = "falling";
  for (const resume of [false, true]) {
    const state = structuredClone(saved);
    let world = createWorld(M, state);
    if (resume) {
      for (let i = 0; i < 120; i++) step(M, world, state);
      state.blocks = snapshot(world.bodies);
      world = createWorld(M, JSON.parse(JSON.stringify(state)));
    }
    for (let i = 0; i < 750 && state.phase === "falling"; i++) step(M, world, state);
    assert.equal(state.phase, "aim");
    for (let i = 0; i < 3600 && state.phase === "aim"; i++) step(M, world, state);
    assert.equal(state.phase, "aim");
    assert.deepEqual(state.players, ["Ada", "Bo"]);
  }
});
test("sustained slow movement does not become a settled turn", () => {
  const state = newGame(() => 0);
  const ground = {id: 1, position: {x: 300, y: 1018}, isStatic: true};
  const body = {id: 2, position: {x: 300, y: 986}, bounds: {min: {y: 972}}, angle: 0,
    speed: 0.01, velocity: {x: 0.01, y: 0}, angularVelocity: 0.0003, isStatic: false};
  ground.parent = ground; body.parent = body;
  const world = { ground, bodies: [body], engine: {pairs: {list: [
    {isActive: true, bodyA: ground, bodyB: body, collision: {normal: {x: 0, y: 1}}}
  ]}}};
  const fakeMatter = {Engine: {update: () => { body.position.x += 0.01; body.angle += 0.0003; }}};
  state.phase = "falling"; state.blocks = [{shape:"bar",x:300,y:986,angle:0,vx:0,vy:0,angularVelocity:0}];
  for (let i = 0; i < 600; i++) {
    step(fakeMatter, world, state);
    assert.equal(state.phase, "falling");
  }
});
test("very slow supported sliding is not mistaken for solver jitter", () => {
  const state = newGame(() => 0);
  const ground = {id: 1, position: {x: 300, y: 1018}, isStatic: true};
  const body = {id: 2, position: {x: 300, y: 986}, bounds: {min: {y: 972}}, angle: 0,
    speed: 0.0005, velocity: {x: 0.0005, y: 0}, angularVelocity: 0, isStatic: false};
  ground.parent = ground; body.parent = body;
  const world = { ground, bodies: [body], engine: {pairs: {list: [
    {isActive: true, bodyA: ground, bodyB: body, collision: {normal: {x: 0, y: 1}}}
  ]}}};
  const fakeMatter = {Engine: {update: () => { body.position.x += body.velocity.x; }}};
  state.phase = "falling"; state.blocks = [{shape:"bar",x:300,y:986,angle:0,vx:0,vy:0,angularVelocity:0}];
  for (let i = 0; i < 600; i++) {
    step(fakeMatter, world, state);
    assert.equal(state.phase, "falling");
  }
});
test("a slowly tilting block on the platform edge is not settled before it falls", () => {
  const state = newGame(() => 0), world = createWorld(M, state);
  state.aim = 465; addBlock(M, world, state);
  for (let i = 0; i < 1500 && state.phase !== "lost"; i++) {
    step(M, world, state);
    assert.notEqual(state.phase, "aim");
  }
  assert.equal(state.phase, "lost");
  assert.equal(state.loser, 0);
});
