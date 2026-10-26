# Geodes

A single-file browser game.

## Run

- Open `geodes.html` in your browser.
- Or open the repo menu: `../gamemenu.html`.

## Notes

This folder contains a standalone HTML game. `geodes.html` is the browser build. `geodes.apk` is the portrait Android build.

On a phone, tap geodes to crack them, then tap the gem. The volcano sits in the bottom third and throws rocks and geodes into slow randomized arcs. They slow naturally at the apex and accelerate downward without a descent-speed cap. Most trajectories miss the gun naturally; there is no gun-targeting bias or side-wall ricochet. Crystals eject with random sideways/upward velocities, stay fully visible, and accelerate until they fall below the screen instead of fading out or bouncing off the floor. A geode or meteor hitting the gun ends the run. Every 10 cracked geodes extends a missile pod; the icons beside it are the ammo, and the pod retracts when it is empty. Pause and volume live in the top menu, while the laser heat gauge sits below the gun and stays within the viewport.

Start at level 1 and advance every 100 destroyed geodes: 99 remains level 1, 100 begins level 2, and 200 begins level 3. Each level adds 8% to the level-1 movement speed of existing and newly spawned geodes, rocks, fireballs, meteors, and crystals. Collected points, destroyed rocks, and meteors do not advance levels. Rocket speed and ammo rules remain unchanged. All falling objects share weak initial gravity (0.45% of playfield height per second squared), increasing by 10% of base for every 10,000 points: 1.0x at zero, 1.1x at 10,000, 1.2x at 20,000. Score changes affect existing objects immediately. Geode/rock launches retain randomized arcs; meteors start at 5.5% of playfield height per second and accelerate along their gun-targeting path. Rockets and tractor beams retain their intentional guided movement.

Rocks, gems, projectiles, and other ordinary world effects draw behind geodes. Meteors and fireballs draw above geodes and all other world objects; floating score labels and the HUD remain readable above the action.

Every laser shot has a short zap, including shots that miss. Audio unlocks on a click, tap, or key press and retries after device suspension. Muting silences the mix; unmuting restores the previous volume.

Rockets have a launch cue, a continuous flight whoosh, and an explosion at detonation. The whoosh stops when the last rocket detonates, the game pauses, resets, or ends, and resumes with any remaining rockets when play resumes.

Rockets travel at 560 pixels per second on desktop and 680 on touch devices, without changing ammo limits. The laser fires at most once every 150 milliseconds. Each shot adds 25% heat, which cools at 20% per second during play. Reaching 100% triggers a distinct warning and locks the laser for two seconds of active play before clearing the heat. Rejected shots do not damage targets or collect gems. Missiles remain available while the laser is overheated.

The heat bar jumps on each actual shot and cools between shots. Spacing shots at least 1.25 seconds apart prevents cumulative heat; rapid firing overheats it. After lockout, the bar resets completely to zero (the next shot then adds its normal heat).

A one-second klaxon warns when a descending geode's trajectory predicts a gun collision within 1.2 seconds. Each geode warns once, and simultaneous warnings do not stack.

Every 24-36 seconds of active play, a meteor can enter from either upper corner, roughly 2.7 times the displayed size of a typical geode. Only one meteor is active at a time. It accelerates toward the gun, with a fire/smoke trail and continuous roar. Three accepted laser hits or one missile impact/blast destroy it; a gun impact ends the run. Each nonlethal hit shrinks its visible body and collision radius by 15% of its original size, replacing the old health dots. Exactly five randomly chosen gems eject evenly in all directions at the same sampled speed as geode gems, retaining their normal gravity and collection behavior without timed fading. Meteor roar and klaxon stop on pause, reset, or game over; roar resumes with a surviving meteor.

Destroying a meteor (by laser or missile) or a fireball sends out an expanding shockwave ring. Geodes and rocks within 300 pixels of a meteor or 170 pixels of a fireball get an outward push that fades within a second, after which they resume their normal arcs. A fireball already breaks every geode and rock on screen, so its shockwave mainly shows as the ring. Meteors leaving play without being destroyed do not make a shockwave. Earning a missile plays a short brass fanfare, at most once per burst, so a fireball that earns several missiles plays it once. Every score award shows a floating `+N` label where the points are earned: rocks (+5), fireball-cleared geodes (+100) and rocks (+5), and gems (their value, at the gun when the tractor beam delivers them). Geodes and meteors award no direct points, so they show no label. Shockwaves (6) and labels (40) are capped and clear on reset.

Run the audio regression checks with `node --test geodes/audio.test.cjs` from the repository root.

For isolated browser integration checks on Windows, run `node --test geodes/browser-integration.test.cjs`. This uses installed Chrome and removes its temporary browser profile afterward. Set `GEODES_TEST_BROWSER` to another installed Chromium executable if needed.

The browser regression shoots a crystal, verifies its tractor-beam collection awards points, and advances subsequent frames to ensure the game loop keeps running. It also checks that the missile fanfare is audible and then stops, that a destroyed meteor's shockwave pushes a nearby geode and rock away and clears afterward, and that a `+5` label is drawn and then removed. Physics checks cover accelerating opaque crystals, offscreen cleanup, score-threshold gravity, shrinking meteors, and actual foreground draw order. Set `GEODES_TEST_URL` to the deployed game URL to run the same checks against published HTML.
