# Emberkeep: The Ashen Crown

Open `index.html` directly in a desktop browser. It is a self-contained, offline HTML5 action RPG with embedded artwork and no installation, external requests, or dependencies.

## Play

WASD or arrow keys move. Mouse aims; hold left click or Space to attack. Shift dodges in the movement direction (35 resolve; regenerates). Q drinks a potion (65 vitality). E opens nearby chests, equips dropped weapons, and uses blue stairs. P or Escape pauses. New run confirms before replacing a live adventure. Leaving the tab pauses automatically.

Explore five randomized chapters: dungeon, castle, crypt, keep, and dragon throne. Stairs restore vitality. Gold and potions collect on approach. Weapon pickups show their power before equipping; the previous weapon remains on the floor. Skeletons telegraph melee, goblins rush, slimes lumber, and mages fire aimed bolts. The final dragon alternates a telegraphed flame cone and radial fireballs. Kill it to recover the Ashen Crown. Experience increases rank and vitality. Runs are not saved between browser sessions.

## Supplied artwork

All 15 original `sample_images/NoLoRA_*.jpg` files were inspected as full room references, not sprite sheets. A source-art gallery embeds reduced copies of every image. Gameplay floor masonry is cropped from NoLoRA_0008 (390, 240, 510, 320); wall masonry from NoLoRA_0015 (230, 110, 350, 160). The original source files are unchanged. The procedural geometry, actors, objects, telegraphs, and effects are drawn in Canvas to match the supplied torchlit stone aesthetic.

## Generation and diagnostics

Twelve jittered rooms are connected by three-tile-wide corridors forming a spanning chain with extra links. Collision uses the same floor grid as rendering and pathfinding. Every floor has a starting sanctuary, lootable stores, and a reachable exit. Enemies follow a breadth-first distance field. Chapter V reserves the last room for a dragon.

Add `?test` to expose read-only `emberkeep.generate(seed, chapter)` and `emberkeep.snapshot()` diagnostics. `tests.cjs` runs seeded connectivity, collision, combat, loot, progression, and boss checks against the actual embedded game script using Node's built-in VM and assertions. No dependency installation is required.

Run `node 3d_dungeons\tests.cjs` from the repository root. With Python Playwright and Microsoft Edge already installed, `python 3d_dungeons\browser_checks.py` exercises actual keyboard controls in an isolated headless browser, saves screenshots and a JSON report to `D:\AI_Output`, and checks offline image loading and browser errors. Stairs and boss scenarios use fixture positioning to isolate those mechanics; this is not a claim of a full unassisted playthrough.
