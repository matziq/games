# Aztec: The jade expedition

A playable browser homage to Paul Stephenson's **Aztec**, published by Datamost
for the Apple II in 1982. Original JavaScript and pixel-drawn artwork; no ROM,
emulator, extracted sprites, copied title illustration, runtime dependencies,
downloaded fonts, or remote audio requests. Licensed sound excerpts are bundled
locally alongside original synthesized effects. This is separate from this repository's `aztec_hero` and
`treasure_aztecs`.

Open **index.html** directly, or launch **Aztec: The jade expedition** from the
games menu. The source needs its sibling `engine.js`, `game.js`, `audio.js`, and
`audio-samples.js`. Choose a
difficulty from 1 to 8, a keyboard style, and optionally a seed. Blank seeds
generate a new tomb. The same seed and difficulty reproduce the same layout,
contents, and starting enemies.

## The expedition

Find the jade idol and return to the **left edge of the entrance room's middle
tier**, depth 1 / chamber 1. Each of the 64 connected rooms has three tiers.
Diagonal stairs connect tiers; orange UP/DN shafts connect dungeon depths.
Horizontal exits are on the middle tier. Jump gaps or drop to lower platforms.
Stand at a stair endpoint before climbing.

Start with three strength, a machete, and three dynamite. **Search the entrance
chest first** for a pistol, 18 rounds, and a survey locating the idol. Search other
chests and debris for ammunition, tonics, dynamite, and surveys. Tonics restore
two strength, up to five. Opened containers, collected items, defeated enemies,
and broken stone remain changed when you revisit a room.

Serpents charge, spiders patrol, bats fly, and guards approach and throw high
darts. Duck under darts or bats; use a machete or limited pistol ammunition to
fight. Some bottom tiers have sharp stones or moving ceilings. Seeded chambers
also have **rising water** or **falling rocks**:

- Flooding starts after an eight-second entry warning. Water rises at
  `1.4 + difficulty * 0.18` pixels per second and stops at overflow vents, 76
  pixels above the bottom floor. Middle-tier passages and upper tiers stay dry.
  A submerged explorer has eight seconds of air, then loses one strength every
  two seconds. Getting the head above water restores air. Climb or use the down
  shaft; standing underwater to search costs precious time.
- Rockfall starts three seconds after first entry, then repeats every
  `4.4 - difficulty * 0.23` seconds. Dust, an exclamation mark, and an orange
  ground marker warn of the exact column for 1.4 seconds before each drop.
  Actual falling stones cause one damage on contact, then disappear on impact.
  Columns cycle predictably across the upper-right platform; stairs, the idol
  position, and room exits are not spawn points.

Both traps persist and continue on the expedition's simulation clock after you
leave; they do not activate in unvisited rooms. Pause/help/map/focus loss freezes
everything, including remote floods and falling stones. Rocks are cleaned up
after impact rather than accumulating offscreen. Retry resets all traps.
Every seed has both types, but the entrance is always safe. Overflow limits and
clear rockfall intervals preserve traversable mandatory routes on a late return.

### What dynamite does

Press **P** in classic mode, **B** in modern mode, or **BOMB** on touch controls.
It is a demolition tool and an area weapon: breach orange **TNT-marked walls**
to reach supplies, break orange cracked floor sections to create drops, or kill
enemies within 65 pixels. Searchable loot falls to the next supported tier when
its floor is destroyed. The blast report states what actually broke or died.

A stick falls until supported and has a **2.4-second fuse**. Only one can be lit
at once, even across rooms. **Your own blast costs two strength** within 58
pixels; retreat at least 60 pixels. Main stairs and the bottom floor are protected
in this adaptation so demolition cannot destroy the only escape route.
Dynamite does not drain floodwater or disable the rockfall mechanism, and its
fuse continues underwater.

Recovering the idol is not enough: physically return to the entrance. The final
reward is `max(100, difficulty * 10000 - elapsedSeconds * 5)`, rounded to an
integer. Killing enemies and breaking stone do not add points. Difficulty
increases enemy population, speed, detection range, dart frequency, flood speed,
and rockfall frequency.
Death offers a full retry of the same seed or a new expedition.

## Controls

Classic commands deliberately keep moving after a key is released:

| Key | Action |
| --- | --- |
| W / R / S | Walk / run / stop |
| A / D | Face left / right |
| J / G / C | Jump / crawl / climb the nearest stair or shaft |
| O / L / T | Open / look / take; rubble needs two opens |
| F | Stop and enter fight mode |
| In fight: A / D / S | Step left / step right / turn around |
| In fight: M / L | Machete slash / longer, slower lunge |
| In fight: G / Space | Draw pistol / fire |
| W / R / J | Leave fight mode |
| P | Place and light dynamite |
| Z or I | Map and inventory |

Modern keyboard:

| Key | Action |
| --- | --- |
| Left / Right | Hold to move |
| Up / Down | Climb at an endpoint or shaft; hold Down to duck |
| Space | Jump; hold a direction to clear a gap |
| E | Search: successive presses open, look, and take |
| X / Z / B | Machete / pistol / dynamite |
| I | Map and inventory |

Both styles: **Escape** pauses, **?** opens help, and **Tab** keeps normal browser
focus navigation. Click/tap the playfield after using a toolbar control to
restore keyboard play if needed. Touch controls use held movement with either
keyboard style. Down ducks and attempts a downward climb; STAIR selects the
nearest endpoint. Moving and jumping support simultaneous touches. STOP cancels
held and command movement.

Help, map, pause, setup, and focus loss stop the simulation and reward timer.
Closing help/map preserves the previous pause state. Sound starts off and can be
enabled without changing game state. Reduced-motion mode removes hit flicker,
decorative walking animation, fuse flicker, water shimmer, dust animation, and
blast flashes; it retains static warnings and the motion required to play.

There is **no saved run or local-storage requirement**. Reloading starts over.
The canvas has readable HTML instructions and status, but the spatial game is
not fully playable with a screen reader.

## Sound

Sound is **off by default**; the Sound button creates/resumes Web Audio only after
a user gesture. There is no background music or remote asset download.

- The pistol uses an actual CZ-52 target-shooting excerpt, layered with a short
  crack/body/reflection. Dynamite uses a licensed designed explosion (sensor
  preamble removed), plus original bass rumble and debris.
- The fuse sizzles for the actual remaining 2.4-second fuse, not a fixed UI sound.
  Leave the room and the fuse goes quiet. A detonation in a directly connected
  room is muffled and quiet; distant detonations are silent. Returning before
  detonation resumes the remaining fuse instead of starting it over.
- Live nearby serpents hiss and bats make short modulated squeaks. These animal
  sounds are original synthesis, not recordings. Calls require the current room,
  a live creature within 210 pixels and less than 70 vertical pixels, with
  distance attenuation and stereo placement. At most one creature starts a call
  every 1.8 seconds; each serpent waits at least six seconds and each bat at least
  4.5 seconds before calling again. They are not triggered by movement keys.
- Machete swishes, impacts, breath/thud damage, chest/rubble handling and loot
  clinks replace the old beeps. Floodwater has quiet running-water/bubble ambience;
  falling rocks have separate release and collision sounds; moving ceilings
  scrape once per descent. Jump uses a brief cloth/air shuffle. There were no
  footstep sounds in the prior game, and no new footstep system was added.

Mute, pause, help, map, setup, tab hiding and focus loss fade out active voices.
Room changes and resets discard old voices; death/win stops loops and permits
only a short result tail. Events played while muted/paused are discarded, not
replayed on resume. The mixer caps active voices at ten, attenuates ambience and
creatures, and uses conservative output gain plus compression. Actual listening
volume still depends on the device and operating-system volume.

See [audio provenance and licenses](audio/LICENSES.md). The pistol archive says
CC BY 3.0 despite a CC0 web listing; this distribution retains Vincent Sevedge /
Tabasco attribution and the stricter license. Listener's explosion is CC0.
Credits are also embedded in the offline game's help and sample script.

## Research and adaptation

Sources consulted for this implementation:

- [Wikipedia: Aztec (video game)](https://en.wikipedia.org/wiki/Aztec_(video_game)):
  authorship, 1982 Apple II release, random tomb, difficulty 1–8, three-tier
  side-view rooms, loot, weapons, destructive dynamite, idol-and-escape objective,
  and time-sensitive reward.
- [MobyGames: Aztec](https://www.mobygames.com/game/13259/aztec/) and
  [screenshots](https://www.mobygames.com/game/13259/aztec/screenshots/):
  indexed descriptions and screenshots corroborate the nonlinear adventure,
  inventory, destructible terrain, and hazards. Direct page retrieval returned
  HTTP 403, so no additional inaccessible details are claimed.
- [Original Datamost manual, archived by Museum of Computer Adventure Game History](https://www.mocagh.org/miscgame/aztec-manual.pdf):
  eight floors with eight rooms each, up to three tiers, command-driven
  movement/combat, separate open/look/take actions, initial three strength and
  three dynamite, one lit stick at a time, and reward unrelated to unnecessary
  killing. Manual research was supplied by the coordinating research session.
- The six supplied images in `sample_images` were inspected. The Apple II
  gameplay images informed black space, thin magenta platforms, diagonal stairs,
  limited-color figures, and a compact lower inventory. The illustrated opening
  was not copied. The explicitly labeled PC-88 image is another port, not the
  Apple II visual authority. Reference inputs are ignored by Git and not loaded
  by the game.

This is **not a rule-exact remake**. Its original connected generator uses an
8-by-8 graph with extra loops, three consistent tiers, and a distant upper-tier
idol. A guaranteed starting pistol/survey, visited-room map, modern held-arrow
mode, touch controls, protected main stairs/bottom floor, four enemy behaviors
(not the original ten), overflow-limited floods, telegraphed rockfall, simplified
trap timing, tunable health, fixed fuse, and the
explicit reward formula above are browser adaptation decisions. It does not
reproduce capture/confiscation, destructible stairs, a damaged-idol
time limit, or the original's continuation after death. It is an unaffiliated
tribute, not an official release.

## Development

No installation or bundler is required. With Node.js 18 or later:

```powershell
node --test .\engine.test.cjs
node --check .\engine.js
node --test .\audio.test.cjs
node --check .\audio.js
node --check .\game.js
node .\pack-audio.cjs --check
```

Tests cover deterministic generation and reciprocal connectivity, reachable
idol/escape, movement, stairs, jumping/falling, loot ordering, finite ammo,
facing/range/cooldowns, ducking darts, dynamite, falling loot, permanent terrain
changes, flood timing/air/escape, rock warnings/collision/cleanup, trap persistence
and reset, health, pause, room persistence, death/win, and full untouched
expeditions using normal game actions and physics.

The audio tests cover actual shot/fuse/impact events, muted/stale-event disposal,
creature proximity/cooldowns, offscreen detonation, looping voice cleanup, bounded
mixing, and finite, non-silent waveforms. The browser audio snapshot is read-only:
`window.aztec.audioSnapshot()` reports context state, voices, loops, and play counts.
Waveform measurements are not a claim that someone listened to the mix.

Build a portable, offline **single HTML file**, keeping generated output outside
the repository:

```powershell
node .\build-release.cjs D:\AI_Output\Aztec_browser_game\Aztec.html
```

The game itself remains completely offline; the footer's optional source/menu
links go online in the standalone release. `window.aztec.snapshot()` returns a
detached copy of the running game for observation and browser testing. It cannot
change the active expedition. There is no debug win, teleport, or invulnerability
control.
