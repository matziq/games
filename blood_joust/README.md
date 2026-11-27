# Blood Joust

Blood Joust is a single-page arcade game about battling flying enemies in successive waves. Flap to gain height, then collide from above to win a joust. Defeated enemies drop eggs: collect them for bonus points before they hatch, and avoid the lava and other hazards.

Platforms are solid on all sides. Enemies rest for one second after every five flaps, giving you an opportunity to gain height while they descend.

## Waves and arenas

- **Flight**: each flap gives a strong lift, then the climb slows, hangs briefly at the top, and drifts down at a capped speed. Holding altitude takes about 8 flaps every 10 seconds, down from 14.
- **Arenas**: the platform layout, sizes, and colors change every three waves, cycling through Classic Crag, Twin Spires, Bone Bridges, and Ember Steps. Every layout leaves an open shaft beside each wall, so lava is reachable on both sides for players, enemies, and eggs. On a change, you re-materialize safely on the base platform.
- **Riders**: Blood Knights (green) behave as before. Shadow Riders (purple) and Death Lords (gray) fly faster, chase more often, climb above you to strike, break away when you are higher, and flap out of lava danger even while resting.
- **Egg rush**: every fourth wave has no riders. Between 10 and 16 eggs are scattered across the platforms, and each hatches into a rider after about 9 seconds (staggered). Each egg is worth 250 points and can be grabbed through the respawn shield. Collecting every egg earns a **+1,000** perfect-rush bonus; the HUD shows eggs left and the next hatch time.
- **Pterodactyl**: from wave 3 (except egg rushes), a pterodactyl swoops in from time to time and tracks your height. It flies for a few seconds, shakes its head with a red eye (windup), then roars with its jaws open and glowing gold. It dies only when your lance tip enters its open mouth while you face it during the roar, for 1,000 points times the current kill-chain multiplier. A lance against closed jaws bounces you off; any other contact, including landing on top of it, costs a life. It leaves after about 30 seconds and does not block wave completion.

## Kill chains

Joust kills award their existing base points (100 for a Blood Knight, 250 for a Shadow Rider, 500 for a Death Lord) times a chain multiplier. The first kill is 1x; another kill within 3 seconds of the previous kill is 2x, then 3x, 4x, and so on without a cap. Exactly 3 seconds still qualifies. Every kill refreshes the window; after it expires the next kill starts at 1x. The HUD shows the last award, next multiplier, and remaining time.

The window uses real active play time, including wave announcements, independent of the slowed physics. Pausing or switching tabs freezes it. Losing a life, quitting, or starting a new game resets it. Egg collection remains 250 points and neither extends nor multiplies the chain; enemies lost to hazards do not count.

## Run

Open `blood_joust.html` in a browser, or launch it from the repository menu at `../gamemenu.html`. No build step is required.

Run the gameplay regression checks with `node --test blood_joust\tests\game.test.cjs` from the repository root.

## Controls

- **A / D** or **Left / Right**: move.
- **Space / W**: flap.
- On touch screens, hold the on-screen arrows to move and tap or hold **FLAP** to fly. You can also tap the arena, or the empty space in the portrait control deck, to flap.
- Choose the pause button (top right) or press **Escape** to pause; the game also pauses when the browser loses focus. From the pause menu you can resume or quit to the main menu.
- Use the main menu for instructions and sound settings. Volume, sound effects, and music settings are saved locally, and sound starts after a user interaction.

The game starts with three lives. The personal best is saved in browser storage; score synchronization is available when the repository's score service is configured. The game supports portrait and landscape layouts (on portrait phones, the touch controls sit in a dedicated deck below the arena) and reduces screen shake and flashes when the device requests reduced motion.

## Sound

Effects combine recorded samples with Web Audio synthesis: wing flaps, lance clashes, unseating impacts, armor falls, egg cracks, and menu clicks use samples, while fanfares, lava, pickups, and the quiet in-game music bed (a filtered pad, a war-drum heartbeat that quickens each wave, and sparse bell tones) are synthesized. Sounds are panned to their on-screen position, rate-limited, mixed through effects and music buses into a limiter, and paused when the tab is hidden. If `audio/bj-sfx-cc0.js` is unavailable, every effect falls back to synthesis.

Sample credits: Kenney (www.kenney.nl), "Impact Sounds", "RPG Audio", and "Interface Sounds", released under Creative Commons CC0 1.0 (public domain dedication). See `audio/LICENSE-Kenney-CC0.txt`; crediting is appreciated but not required.
