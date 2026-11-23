import {test} from "node:test";
import assert from "node:assert/strict";
import {LEVELS,PLAYER_X,PLAYER_SIZE,CEILING,newRun,jump,advance,collides,defaultSave,validSave,restoreSave,recordScore,playerName} from "./game.mjs";

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
test("legacy progress and an airborne run migrate without changing the original courses", () => {
  const saved={version:1,unlocked:2,best:[LEVELS[0].length,300,LEVELS[2].length],
    options:{muted:true,volume:0.2},
    run:{level:1,phase:"running",distance:430,y:67,vy:130,ticks:300}};
  const restored=restoreSave(saved);
  assert.equal(restored.version,2);
  assert.deepEqual(restored.best.slice(0,3),saved.best);
  assert.equal(restored.best.length,LEVELS.length);
  assert.equal(restored.unlocked,3);
  assert.deepEqual(restored.options,saved.options);
  assert.deepEqual(restored.profile,{name:"Player 1",avatar:"nova"});
  assert.deepEqual(restored.scores,[]);
  assert.equal(restored.run.phase,"paused");
  assert.equal(restored.run.y,67);
  assert.equal(restored.run.vy,130);
  assert.equal(restored.run.gravity,1);
  assert.equal(restored.run.grounded,false);
});
test("gravity portals carry the player to the ceiling and back to the floor", () => {
  const level=LEVELS[3],run=newRun(3); run.phase="running";
  run.distance=level.portals[0].x-PLAYER_X-1;
  advance(run);
  assert.equal(run.gravity,-1);
  for(let i=0;i<40;i++)advance(run);
  assert.equal(run.y,CEILING-PLAYER_SIZE);
  assert.equal(run.grounded,true);
  assert.equal(jump(run),true);
  assert.ok(run.vy<0);
  run.distance=level.portals[1].x-PLAYER_X-1;run.y=CEILING-PLAYER_SIZE;run.vy=0;run.grounded=true;
  advance(run);
  assert.equal(run.gravity,1);
  for(let i=0;i<40;i++)advance(run);
  assert.equal(run.y,0);
  assert.equal(run.grounded,true);
});
test("a reversed-gravity run resumes with identical motion", () => {
  const saved=defaultSave(); saved.unlocked=3; saved.run=newRun(3);
  saved.run.phase="running"; saved.run.distance=LEVELS[3].portals[0].x-PLAYER_X-1;
  for(let i=0;i<12;i++) advance(saved.run);
  assert.equal(saved.run.gravity,-1);
  const resumed=restoreSave(JSON.parse(JSON.stringify(saved)));
  assert.equal(resumed.run.phase,"paused");
  resumed.run.phase="running";
  for(let i=0;i<25;i++){advance(saved.run);advance(resumed.run);}
  assert.deepEqual(resumed.run,saved.run);
});
test("platforms support jumps from either gravity direction", () => {
  const level=LEVELS[4],p=level.platforms[0];
  for(const gravity of [1,-1]){
    const run=newRun(4);run.phase="running";run.gravity=gravity;run.grounded=false;
    run.distance=p.x+35-PLAYER_X;
    run.y=gravity===1 ? p.y+p.height+2 : p.y-PLAYER_SIZE-2;
    run.vy=gravity===1 ? -100 : 100;
    advance(run);
    assert.equal(run.grounded,true);
    assert.equal(run.y,gravity===1 ? p.y+p.height : p.y-PLAYER_SIZE);
    assert.equal(jump(run),true);
    assert.equal(Math.sign(run.vy),gravity);
  }
});
test("local scores rank, deduplicate, cap, and retain player identity", () => {
  const s=defaultSave();
  assert.equal(playerName("   "),"Player 1");
  for(let i=0;i<15;i++){
    s.profile.name=`Player ${i}`;s.run.distance=100+i*10;s.run.phase="crashed";recordScore(s);
  }
  assert.equal(s.scores.length,10);
  assert.equal(s.scores[0].name,"Player 14");
  assert.ok(s.scores.every((e,i,a)=>i===0 || a[i-1].points>=e.points));
  recordScore(s);
  assert.equal(s.scores.length,10);
  assert.equal(s.scores.filter(e=>e.name==="Player 14").length,1);
  s.profile.avatar="comet";
  const restored=restoreSave(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.scores,s.scores);
  assert.deepEqual(restored.profile,s.profile);
});
