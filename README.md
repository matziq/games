# Games

This repo is a small collection of single-file browser games.

## Quick start

- Open `gamemenu.html` in a browser.
- Click a game to launch it.

> Tip: If your browser blocks any features when using `file://`, you can serve this folder locally (see the **Serving locally** section below).

## Included games

- **2048** – classic sliding tile puzzle. Entry: `2048/2048.html`
- **Bee** – simple bee game. Entry: `bee/bee.html`
- **FruitPile** – physics fruit pile game with **Explosion** and **Merge** modes. Entry: `fruitpile/fruitpile.html`
- **Geodes** – geode-themed game. Entry: `geodes/geodes.html`
- **Real or AI** – pick which photo is real vs AI-generated. Entry: `real_or_ai/real_or_ai.html`

## About `gamemenu.html`

`gamemenu.html` is the landing page for this repo. It links to each game’s entrypoint:

- `2048/2048.html`
- `bee/bee.html`
- `geodes/geodes.html`
- `real_or_ai/real_or_ai.html`
- `fruitpile/fruitpile.html`

## Serving locally (recommended)

Some browsers restrict features (or run slower) when opening files directly from disk.

```pwsh
cd D:\aaaScripts\Games
python -m http.server 5173
```

Then open:

- <http://localhost:5173/gamemenu.html>
