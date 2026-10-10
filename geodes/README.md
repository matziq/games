# Geodes

A single-file browser game.

## Run

- Open `geodes.html` in your browser.
- Or open the repo menu: `../gamemenu.html`.

## Notes

This folder contains a standalone HTML game. `geodes.html` is the browser build. `geodes.apk` is the portrait Android build.

On a phone, tap geodes to crack them, then tap the gem. The volcano sits in the bottom third and throws rocks and geodes upward. They start very slow, arc over, and fall at a steady speed. Later eruptions get faster, but a falling rock does not speed up on the way down. A geode that lands on the gun ends the run. Every 10 cracked geodes extends a missile pod; the icons beside it are the ammo, and the pod retracts when it is empty. Pause and volume live in the top menu so they do not cover the gun.

Every laser shot has a short zap, including shots that miss. Audio unlocks on a click, tap, or key press and retries after device suspension. Muting silences the mix; unmuting restores the previous volume.

Rockets have a launch cue, a continuous flight whoosh, and an explosion at detonation. The whoosh stops when the last rocket detonates, the game pauses, resets, or ends, and resumes with any remaining rockets when play resumes.

Rockets travel at 560 pixels per second on desktop and 680 on touch devices, without changing ammo limits. The laser fires at most once every 150 milliseconds. Each shot adds 25% heat, which cools at 20% per second during play. Reaching 100% triggers a distinct warning and locks the laser for two seconds of active play before clearing the heat. Rejected shots do not damage targets or collect gems. Missiles remain available while the laser is overheated.

The heat bar jumps on each actual shot and cools between shots. Spacing shots at least 1.25 seconds apart prevents cumulative heat; rapid firing overheats it. After lockout, the bar resets completely to zero (the next shot then adds its normal heat).

A one-second klaxon warns when a descending geode's trajectory predicts a gun collision within 1.2 seconds. Each geode warns once, and simultaneous warnings do not stack.

Every 24-36 seconds of active play, a meteor can enter from either upper corner, roughly twice the displayed size of a geode. Only one meteor is active at a time. It heads at the gun 35% faster than the current falling-geode speed, with a fire/smoke trail and continuous roar. Three accepted laser hits or one missile impact/blast destroy it; a gun impact ends the run. Exactly five randomly chosen gems eject evenly in all directions at the same sampled speed as geode gems, retaining their normal gravity, eight-second lifetime, and collection behavior. Meteor roar and klaxon stop on pause, reset, or game over; roar resumes with a surviving meteor.

Run the audio regression checks with `node --test geodes/audio.test.cjs` from the repository root.

For isolated browser integration checks on Windows, run `node --test geodes/browser-integration.test.cjs`. This uses installed Chrome and removes its temporary browser profile afterward. Set `GEODES_TEST_BROWSER` to another installed Chromium executable if needed.
