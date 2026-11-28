# Blood Joust

Blood Joust is a single-page arcade game about battling flying enemies in successive waves. Flap to gain height, then collide from above to win a joust. Defeated enemies drop eggs: collect them for bonus points before they hatch, and avoid the lava and other hazards.

Platforms are solid on all sides. Enemies rest after every five flaps; higher tiers recover faster.

## Waves and arenas

- **Flight**: each flap gives a strong lift, then the climb slows, hangs briefly at the top, and drifts down at a capped speed. Holding altitude takes about 8 flaps every 10 seconds, down from 14.
- **Arenas**: the platform layout, sizes, and colors change every three waves, cycling through Classic Crag, Twin Spires, Bone Bridges, and Ember Steps. Every layout leaves an open shaft beside each wall, so lava is reachable on both sides for players, enemies, and eggs. On a change, you re-materialize safely on the base platform.
- **Riders**: five tiers: 1 Blood Knight (green, 100 points), 2 Storm Rider (cyan, 175), 3 Shadow Rider (purple, 250), 4 Ember Lord (orange, 375), 5 Death Lord (gray/black, 500). Each tier increases speed and chase likelihood, improves height advantage and motion prediction, and reduces the rest after five flaps (1.0 to 0.5 seconds). Tiers 3-5 break away when out-climbed and skip rest to avoid lava. A numbered badge identifies the tier without relying on color. One tier unlocks per wave, up to five; eggs retain their defeated rider's tier and hatch one tier higher, capped at five.
- **Bridge and skeleton hands**: a full-width, walkable bridge covers the lava through waves 1-4, across every arena. It visibly burns away during the wave 5 announcement; from then on both side shafts lead to exposed lava. Near exposed lava, a hand flashes a warning for 0.625 seconds before reaching. Move sideways or climb to dodge. A grabbed rider cannot move or fight and is dragged down. A grabbed player must make **6 fresh flap presses within 1.25 seconds** to escape (Space/W, FLAP button taps, or arena taps); holding a key/button and key-repeat do not count. The escape meter shows progress; slow presses reset the burst. Escaping gives a short shield and a 3.75-second hand cooldown. Hands are indestructible, cannot be lanced, and hazard kills give neither points nor chain credit. New games restore the bridge.
- **Egg rush**: every fourth wave has no riders. Between 10 and 16 eggs are scattered across the platforms, and each hatches into a rider after about 9 seconds (staggered). Each egg is worth 250 points and can be grabbed through the respawn shield. Collecting every egg earns a **+1,000** perfect-rush bonus; the HUD shows eggs left and the next hatch time.
- **Pterodactyl**: from wave 3 (except egg rushes), a pterodactyl swoops in from time to time and tracks your height. It flies for a few seconds, shakes its head with a red eye (windup), then roars with its jaws open and glowing gold. It dies only when your lance tip enters its open mouth while you face it during the roar, for 1,000 points times the current kill-chain multiplier. A lance against closed jaws bounces you off; any other contact, including landing on top of it, costs a life. It leaves after about 30 seconds and does not block wave completion.

## Kill chains

Joust kills award their rider tier's base points times a chain multiplier. The first kill is 1x; another kill within 3 seconds of the previous kill is 2x, then 3x, 4x, and so on without a cap. Exactly 3 seconds still qualifies. Every kill refreshes the window; after it expires the next kill starts at 1x. The HUD shows the last award, next multiplier, and remaining time.

The window uses real active play time, including wave announcements, independent of the slowed physics. Pausing or switching tabs freezes it. Losing a life, quitting, or starting a new game resets it. Egg collection remains 250 points and neither extends nor multiplies the chain; enemies lost to hazards do not count.

Every award (kills with chain multipliers, eggs, perfect-rush bonus, and pterodactyl) shows a readable floating `+N` beside the player. Simultaneous awards are stacked and outlined for contrast; popups freeze while paused.

## Run

Open `blood_joust.html` in a browser, or launch it from the repository menu at `../gamemenu.html`. No build step is required.

Run the gameplay regression checks with `node --test blood_joust\tests\game.test.cjs` from the repository root.

## Controls

- **A / D** or **Left / Right**: move.
- **Space / W**: flap.
- **Hold S / Down arrow**: dive. While held, your rider falls with double gravity and reaches up to twice the normal maximum fall speed, so a drop covers about twice the distance in the same time. Releasing it restores normal flight immediately. Flapping still works while diving, and pausing or leaving the tab releases the dive.
- On touch screens, hold the on-screen arrows to move and tap or hold **FLAP** to fly. You can also tap the arena, or the empty space in the portrait control deck, to flap.
- Choose the pause button (top right) or press **Escape** to pause; the game also pauses when the browser loses focus. From the pause menu you can resume or quit to the main menu.
- Use the main menu for instructions and sound settings. Volume, sound effects, and music settings are saved locally, and sound starts after a user interaction.

The game starts with three lives. The personal best is saved in browser storage; score synchronization is available when the repository's score service is configured. The game supports portrait and landscape layouts (on portrait phones, the touch controls sit in a dedicated deck below the arena) and reduces screen shake and flashes when the device requests reduced motion.

## Sound

Each rider materialization plays a short (0.45-second) detuned electronic drone through the effects bus and limiter. It respects effects mute and volume, is rate-limited to one cue per 0.25 seconds, and never starts a persistent loop. No new external audio is needed.

Effects combine recorded samples with Web Audio synthesis: wing flaps, lance clashes, unseating impacts, armor falls, egg cracks, and menu clicks use samples, while fanfares, lava, pickups, and the quiet in-game music bed (a filtered pad, a war-drum heartbeat that quickens each wave, and sparse bell tones) are synthesized. Sounds are panned to their on-screen position, rate-limited, mixed through effects and music buses into a limiter, and paused when the tab is hidden. If `audio/bj-sfx-cc0.js` is unavailable, every effect falls back to synthesis.

Sample credits: Kenney (www.kenney.nl), "Impact Sounds", "RPG Audio", and "Interface Sounds", released under Creative Commons CC0 1.0 (public domain dedication). See `audio/LICENSE-Kenney-CC0.txt`; crediting is appreciated but not required.
