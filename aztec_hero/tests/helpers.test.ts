import assert from 'node:assert/strict';
import test from 'node:test';
import { clampFrameDelta, roomForY } from '../src/gameplay.ts';
import { InputState } from '../src/input/InputState.ts';

test('room progress starts at room 1 and ends at room 9', () => {
  assert.equal(roomForY(2360), 1);
  assert.equal(roomForY(2208), 2);
  assert.equal(roomForY(736), 9);
  assert.equal(roomForY(-100), 9);
  assert.equal(roomForY(9999), 1);
});

test('frame delta is non-negative and bounded after resume', () => {
  assert.equal(clampFrameDelta(-1), 0);
  assert.equal(clampFrameDelta(16), 16);
  assert.equal(clampFrameDelta(5000), 50);
});

test('input state supports multiple simultaneous pointers and edge presses', () => {
  const input = new InputState();
  input.press('left', 1);
  input.press('jump', 2);
  input.press('left', 3);
  assert.equal(input.isDown('left'), true);
  assert.equal(input.isDown('jump'), true);
  assert.equal(input.consumePressed('jump'), true);
  assert.equal(input.consumePressed('jump'), false);
  input.release(1);
  assert.equal(input.isDown('left'), true);
  input.release(3);
  assert.equal(input.isDown('left'), false);
  assert.equal(input.isDown('jump'), true);
  input.releaseAll();
  assert.equal(input.isDown('jump'), false);
});
