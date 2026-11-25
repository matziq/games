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
- **FruitPile** – physics fruit-merging game. Entry: `fruitpile/fruitpile.html`
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

### License Plate Game designs

Each state has separate Previous, Next (both wrap), and Random buttons. Random
chooses a different design only for that state; these controls never mark or
unmark a state. Plate choices use stable IDs in `plateGame.selections.v1`, separate
from found-state progress. They survive refresh, later visits, and trip reset.
The old automatic visit-history key (`plateGame.images.v1`) is intentionally
ignored, not migrated as a player preference. Launch and refresh do not randomize
or write new preferences.

Without a valid saved choice, each state uses an explicitly reviewed standard
passenger design from `PLATE_DEFAULTS`, not the newest specialty image. Defaults
are the most recent verified standard available in this licensed collection, not
a guarantee of today's issue. Storage failures warn and leave the game playable.
Images are local and lazy-loaded only when selected; complete source credits and
coverage tables are built when their disclosure is opened.

The collection includes recent photographs and historical plates where available.
The coverage table reports each state's count against goals of 10 verified recent
designs and 5 historic examples. Recent designs have source-supported eras
starting in 2011–2026. It separately counts unknown design eras and photographs
dated 2011–2026; a recent photograph does not establish a plate's issue date.
Some states fall short, and unverified design eras are not counted as recent. Dated
defaults are disclosed, including older standards where a newer reusable image
was unavailable.

Source titles, authors, individual licenses, resize/crop notes, and design keys
are in `license_plate_assets/plate-images.js`. Exact per-state counts, recent
and historic shortfalls, default evidence, and sourcing limitations are recorded
in `license_plate_assets/coverage.json` and shown in the game. Historical annual
issues count only when color, artwork, or an embossed date differs; serial-only
and renewal-sticker-only changes are excluded. Each image retains its original
license. No invented plate art is used when an image is unavailable.
Some browsers restrict features (or run slower) when opening files directly from disk.

```pwsh
cd D:\aaaScripts\Games
python -m http.server 5173
```

Then open:

- <http://localhost:5173/gamemenu.html>
