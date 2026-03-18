# Games

A collection of single-file browser games. Play them all at **[matziq.github.io/games](https://matziq.github.io/games/)**.

## Quick Start

- **Live:** Visit the link above.
- **Local:** Open `gamemenu.html` in a browser, or serve locally (see below).

## Included Games

| Game | Description | Entry |
|------|-------------|-------|
| **2048** | Classic sliding tile puzzle | `2048/2048.html` |
| **Aztec Hero** | Phaser-based action platformer | `aztec_hero/dist/index.html` |
| **Bee** | Simple bee game | `bee/bee.html` |
| **Betris** | Block-stacking puzzle | `betris/betris.html` |
| **Blood Joust** | Joust-inspired flying mount combat with over-the-top gore, lava hands, eggs, and wave-based enemies | `blood_joust/blood_joust.html` |
| **Domino Combo** | Match-3 dice/domino puzzle with merge and chain combos | `domino_combo/index.html` |
| **FruitPile** | Physics fruit pile game with Explosion and Merge modes | `fruitpile/fruitpile.html` |
| **Geodes** | Geode-themed game | `geodes/geodes.html` |
| **Real or AI** | Guess which photo is real vs AI-generated | `real_or_ai/real_or_ai.html` |
| **Treasure Aztecs** | Treasure-hunting adventure | `treasure_aztecs/treasure_aztecs.html` |

## Shared Scripts

- `scripts/mobile-controls.js` — Fullscreen toggle button, auto-fullscreen on first interaction
- `scripts/github-scores.js` — High score persistence via GitHub Pages

## Serving Locally

Some browsers restrict features when opening files directly from disk.

```pwsh
cd D:\aaaScripts\Games
python -m http.server 5173
```

Then open: <http://localhost:5173/gamemenu.html>
