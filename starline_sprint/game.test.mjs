import {test} from "node:test";
import assert from "node:assert/strict";
import {LEVELS,PLAYER_X,newRun,jump,advance,collides,defaultSave,validSave,restoreSave} from "./game.mjs";

test("each course is completable across a range of jump timings", () => {
  LEVELS.forEach((level, index) => {
    for (const distance of [38,50,62]) {
      const run = newRun(index); run.phase = "running";
      for (let i=0; i<4000 && run.phase==="running"; i++) {
        const front=run.distance+PLAYER_X+11;
        const next=level.obstacles.find(o => o.x + o.width > front);
        if (next && next.x-front <= distance && next.x-front > -20) jump(run);
        advance(run);
      }
      assert.equal(run.phase,"complete",`${level.name} at ${distance} stopped at ${run.distance}`);
    }
  });
});
test("collisions end a run and jumping is only possible on the ground", () => {
  const run=newRun(); run.phase="running";
  assert.equal(jump(run),true);
  assert.equal(jump(run),false);
  advance(run);
  assert.ok(run.y>0);
  assert.equal(jump(run),false);
  const unjumped=newRun(); unjumped.phase="running";
  for(let i=0;i<1000&&unjumped.phase==="running";i++) advance(unjumped);
  assert.equal(unjumped.phase,"crashed");
  const frozen=unjumped.distance;
  advance(unjumped);
  assert.equal(unjumped.distance,frozen);
});
test("spike collision follows the visible triangle, not its empty corners", () => {
  const obstacle=LEVELS[0].obstacles[0], run=newRun();
  run.distance=obstacle.x-10-PLAYER_X; run.y=2;
  assert.equal(collides(run,obstacle),false);
  run.distance=obstacle.x+obstacle.width/2-PLAYER_X; run.y=0;
  assert.equal(collides(run,obstacle),true);
  run.y=obstacle.height;
  assert.equal(collides(run,obstacle),false);
});
test("a running save restores paused with exact physics and options", () => {
  const s=defaultSave(); s.run.phase="running"; jump(s.run);
  for(let i=0;i<7;i++) advance(s.run);
  s.best[0]=s.run.distance; s.options={volume:0.2,muted:true};
  const saved=JSON.parse(JSON.stringify(s)), restored=restoreSave(saved);
  assert.equal(restored.run.phase,"paused");
  assert.equal(restored.run.distance,s.run.distance);
  assert.equal(restored.run.y,s.run.y);
  assert.equal(restored.run.vy,s.run.vy);
  assert.deepEqual(restored.options,s.options);
  restored.run.phase="running";
  for(let i=0;i<20;i++){advance(s.run);advance(restored.run);}
  assert.deepEqual(restored.run,s.run);
  saved.run.distance=Infinity;
  assert.equal(validSave(saved),false);
  assert.throws(()=>restoreSave(saved),/Invalid/);
});
