# Aztec: The jade expedition

A playable browser homage to Paul Stephenson's **Aztec**, published by Datamost
for the Apple II in 1982. Original JavaScript and pixel-drawn artwork; no ROM,
emulator, extracted sprites, copied title illustration, dependencies, fonts, or
network requests. This is separate from this repository's `aztec_hero` and
`treasure_aztecs`.

Open **index.html** directly, or launch **Aztec: The jade expedition** from the
games menu. The source needs its sibling `engine.js` and `game.js`. Choose a
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
node --check .\game.js
```

Tests cover deterministic generation and reciprocal connectivity, reachable
idol/escape, movement, stairs, jumping/falling, loot ordering, finite ammo,
facing/range/cooldowns, ducking darts, dynamite, falling loot, permanent terrain
changes, flood timing/air/escape, rock warnings/collision/cleanup, trap persistence
and reset, health, pause, room persistence, death/win, and full untouched
expeditions using normal game actions and physics.

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
