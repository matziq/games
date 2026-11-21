# Games

This repo is a small collection of single-file browser games and apps.

## Quick start

- Open `gamemenu.html` in a browser.
- Click a game to launch it.

> Tip: If your browser blocks any features when using `file://`, you can serve this folder locally (see the **Serving locally** section below).

## Included games

- **50 States License Plate Game** - spot and mark all 50 states, search plates, and hide found states. Entry: `license_plate_game.html`
- **Emberkeep: The Ashen Crown** - overhead medieval action RPG with five distinct procedural realms and monster broods, weapons, lootable armor, independent music/effects controls, and a dragon boss. Entry: `3d_dungeons/index.html`
- **Aztec: The jade expedition** – original Apple II-inspired tomb adventure with 64 seeded rooms, classic commands, touch controls, and an idol-and-escape objective. Entry: `Aztec/index.html`
- **2048** – classic sliding tile puzzle. Entry: `2048/2048.html`
- **Bee** – simple bee game. Entry: `bee/bee.html`
- **FruitPile** – physics fruit pile game with **Explosion** and **Merge** modes. Entry: `fruitpile/fruitpile.html`
- **Geodes** – geode-themed game. Entry: `geodes/geodes.html`
- **Real or AI** – pick which photo is real vs AI-generated. Entry: `real_or_ai/real_or_ai.html`
- **GTA VI Countdown** – release countdown and the latest official GTA VI news. Entry: `gtavi_countdown/index.html`
- **Token Hearth** – AI token fireplace with a fluid-simulated fire, hosted on the main site. Entry: <https://memconfigmgr.org/token-hearth/>

## Included apps

- **Neon Pulse** – local MP3, WAV, and FLAC player with reactive visualizers. Entry: `neon_pulse/index.html`

## About `gamemenu.html`

`gamemenu.html` is the landing page for this repo. It links to each game’s entrypoint:

- `Aztec/index.html`
- `3d_dungeons/index.html`
- `2048/2048.html`
- `bee/bee.html`
- `geodes/geodes.html`
- `real_or_ai/real_or_ai.html`
- `fruitpile/fruitpile.html`
- `gtavi_countdown/index.html`

## Serving locally (recommended)

### License Plate Game progress

Found plates are saved automatically in this browser on this device, using the
existing `plateGame.found.v1` localStorage key. Returning to the same site restores
valid saved plates. Reset and Start a New Trip both save an empty trip. A visible
status reports restored saves, damaged data, and storage failures; gameplay remains
available even if saving is blocked. Progress is not synced across devices or
browsers, and clearing site data (or ending a private session) can remove it.

Run the focused gameplay and persistence checks with
`node --test scripts/license-plate-game.test.cjs`.

The game includes 100 locally hosted plate photographs and sample images: a
modern-era and a historical example for each state. Each new page visit selects
an image per state, avoiding the previous selection when browser storage works.
Reset and filters do not reroll images. Image history uses `plateGame.images.v1`,
separate from found-state saves. Source titles, authors, license links, and
resize/crop notes are in the game's expandable credits and
`license_plate_assets/plate-images.js`; each image retains its individual license.

This is a mixed-date reference collection, not a complete catalog of the latest
2026 standard designs. Current standard images with verified reuse permissions
could not be established for Alabama, Nebraska, Rhode Island, South Dakota, and
Wyoming in the consulted sources. Their modern entries are explicitly identified
as an Alabama fleet plate, Nebraska's 2017 base, Rhode Island's 2013 plate, South
Dakota's 2018 plate, and a 2018 University of Wyoming plate. No invented plate art
is used when an image is unavailable.

Some browsers restrict features (or run slower) when opening files directly from disk.

```pwsh
cd D:\aaaScripts\Games
python -m http.server 5173
```

Then open:

- <http://localhost:5173/gamemenu.html>
