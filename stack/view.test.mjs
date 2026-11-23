import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_WIDTH, VIEW_HEIGHT, cameraFor, pointerWorldX } from "./view.mjs";

const body = (left, top, right, bottom) => ({bounds:{min:{x:left,y:top},max:{x:right,y:bottom}}});
function visible(camera, x, y) {
  const sx = camera.x + x * camera.scale, sy = camera.y + y * camera.scale;
  assert.ok(sx >= -1e-8 && sx <= VIEW_WIDTH + 1e-8, `x=${sx}`);
  assert.ok(sy >= -1e-8 && sy <= VIEW_HEIGHT + 1e-8, `y=${sy}`);
}

test("camera fits the complete tower, platform, and next piece", () => {
  const bodies = [body(170, 972, 282, 1000), body(200, -250, 284, -222)];
  const ghost = body(240, -410, 352, -382);
  const camera = cameraFor(bodies, ghost, 1000);
  for (const [x, y] of [[140,1000],[460,1036],[170,1000],[284,-250],[240,-410],[352,-382]]) {
    visible(camera, x, y);
  }
  assert.ok(camera.scale < 1);
});

test("camera retains falling pieces outside the normal world area", () => {
  const camera = cameraFor([body(-45, 995, 65, 1060)], null, 1000);
  visible(camera, -45, 995);
  visible(camera, 65, 1060);
  visible(camera, 460, 1036);
});

test("pointer mapping inverts camera at different canvas sizes", () => {
  const camera = cameraFor([body(200, -100, 300, -70)], body(-10, -260, 100, -232), 1000);
  for (const width of [180, 320, 596]) {
    const rect = {left:42, width};
    for (const x of [45, 300, 555]) {
      const clientX = rect.left + (camera.x + x * camera.scale) / VIEW_WIDTH * rect.width;
      assert.ok(Math.abs(pointerWorldX(clientX, rect, camera) - x) < 1e-9);
    }
  }
});
