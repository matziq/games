# Emberkeep: The Ashen Crown

Open `index.html` directly in a desktop browser. It is a self-contained, offline HTML5 action RPG with embedded artwork and no installation, external requests, or dependencies.

## Play

WASD or arrow keys move. Mouse aims; hold left click or Space to attack. Shift dodges in the movement direction (35 resolve; regenerates). Q drinks a potion (65 vitality). E opens nearby chests, equips dropped weapons or armor, and uses blue stairs. P or Escape pauses. New run confirms before replacing a live adventure. Leaving the tab pauses automatically.

Descend through five randomized realms, each with its own floor and wall palette, architectural motifs, torch color, ambience, and creature roster: flooded limestone halls, a thornwood castle, a moonlit crypt, a ruined keep, and the Cinder Forge. Each brood has distinct silhouettes and a mix of melee, ranged, or charging behaviors; stairs carry the player into the next realm, restore vitality, and change the atmosphere and enemies. Gold and potions collect on approach. Equipment pickups compare their stats with your current gear before equipping; replaced equipment remains on the floor. Goblins and wolves rush, archers and cultists telegraph aimed bolts, and wraiths glide in spectral robes. The final dragon alternates a telegraphed flame cone and radial fireballs. Kill it to recover the Ashen Crown. Experience increases rank and vitality. Runs are not saved between browser sessions.

## Equipment

Longswords, war axes, flanged maces, and spears have distinct silhouettes both in your hand and on the ground. Longswords recover fastest (0.36 seconds); axes deal more damage with slower recovery (0.46 seconds); maces trade reach for impact (0.42 seconds); spears offer longer reach with slightly lower damage (0.40 seconds). All retain the same aimed melee arc. Rarity and chapter improve power; the equipment panel displays total strike power, reach, and recovery.

Leather, chainmail, and plate armor visibly change the knight's shoulders and torso. Every chest contains armor; monsters, barrels, and crates can also drop it. Press E to equip, not automatic pickup. Armor reduces all incoming damage, including spells and dragon flame, by its displayed percentage, capped at 40%. It does not stack or affect dodge invulnerability. Armor persists between chapters; new runs begin without armor. The equipment panel and pickup comparison display damage reduction.

## Sound

Web Audio synthesizes sparse chapter-specific plucked music, low drones, torch/wind ambience, weapon-specific strikes (steel swish, heavy axe, mace thud, spear rush), distinct voices and hit timbres for every realm creature, damage, coins, opening chests, distinct barrel/crate breaks, armor clinks, potion bottle pickup, healing, dodging, spell bolts, rank advancement, dragon warnings/fire, and victory/death cues. Effects vary pitch/filter timbre and noise offsets per event independently of gameplay randomness. No external sound files or network requests are used.

**Sound effects** and **Music** are independent on/off buttons with separate gain buses. Music includes the low drone and torch/wind ambience; Sound effects controls every gameplay cue. Both default to on; the shared Volume slider defaults to 55% and affects both. Audio unlocks/resumes on clicks or keys, subject to browser autoplay policy. The status message explains blocked or unsupported audio and provides a retry path. Music/ambience fades on pause or tab departure; event tails finish naturally. Settings last for the current page session.

`DungeonAudio.diagnostic()` reports context state, post-volume analyser RMS, separate music/effects bus RMS, event counts, both mute states, volume, and startup errors. `audio_checks.py` validates gesture startup, real nonzero audio samples, event output, mute silence, unmute, zero-volume silence, and browser suspension recovery in isolated Microsoft Edge. `equipment_checks.py` verifies actual equipped/ground silhouettes, E-driven armor loot/equip/swap, damage reduction, all four independent audio toggle combinations, weapon-specific profiles, and randomized pitch. It saves gameplay and silhouette screenshots and JSON evidence to `D:\AI_Output`. Pass a deployed URL ending in `?test` as its first argument to repeat the checks on the live game. Measurements validate generated browser audio, not human listening or physical speaker output.

## Supplied artwork

All 15 original `sample_images/NoLoRA_*.jpg` files were inspected as full room references, not sprite sheets. A source-art gallery embeds reduced copies of every image. Gameplay floor masonry is cropped from NoLoRA_0008 (390, 240, 510, 320); wall masonry from NoLoRA_0015 (230, 110, 350, 160). The original source files are unchanged. The procedural geometry, actors, objects, telegraphs, and effects are drawn in Canvas to match the supplied torchlit stone aesthetic.

## Generation and diagnostics

Twelve jittered rooms are connected by three-tile-wide corridors forming a spanning chain with extra links. Collision uses the same floor grid as rendering and pathfinding. Every floor has a starting sanctuary, lootable stores, and a reachable exit. Enemies follow a breadth-first distance field. Chapter V reserves the last room for a dragon.

Add `?test` to expose read-only `emberkeep.generate(seed, chapter)`, the five chapter themes and rosters, and `emberkeep.snapshot()` diagnostics. `tests.cjs` runs seeded connectivity, theme/roster uniqueness, collision, combat, loot, progression, and boss checks against the actual embedded game script using Node's built-in VM and assertions. `chapter_theme_checks.py` advances through every realm with the real E/stairs input path, checks the active theme and roster, captures actual Edge screenshots, and creates a contact sheet in `D:\AI_Output`. No dependency installation is required.

Run `node 3d_dungeons\tests.cjs` from the repository root. With Python Playwright and Microsoft Edge already installed, `python 3d_dungeons\browser_checks.py` exercises actual keyboard controls in an isolated headless browser, saves screenshots and a JSON report to `D:\AI_Output`, and checks offline image loading and browser errors. Stairs and boss scenarios use fixture positioning to isolate those mechanics; this is not a claim of a full unassisted playthrough.
