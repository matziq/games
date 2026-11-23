import {test} from "node:test";
import assert from "node:assert/strict";
import {createMusic} from "./audio.mjs";

test("a delayed audio resume cannot undo a pause", async () => {
  const targets = [];
  let finish;
  const original = globalThis.window;
  class Audio {
    constructor() { this.state="suspended"; this.currentTime=0; this.destination={}; }
    createGain() { return {gain:{setTargetAtTime:value=>targets.push(value)},connect(){}}; }
    resume() { return new Promise(resolve => { finish=() => {this.state="running";resolve();}; }); }
  }
  globalThis.window = {AudioContext:Audio};
  try {
    const music=createMusic(() => { throw new Error("unexpected audio error"); });
    const pending=music.activate({muted:false,volume:0.35});
    music.silence();
    finish();
    await pending;
    assert.deepEqual(targets,[0]);
  } finally { globalThis.window=original; }
});
