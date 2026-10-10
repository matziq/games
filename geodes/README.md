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

Run the audio regression checks with `node --test geodes/audio.test.cjs` from the repository root.
