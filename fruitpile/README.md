# FruitPile

A mobile-friendly physics game where fruit fall into a pile.

It has two modes:

- **Fruit Explosion**: if 2+ of the same fruit touch, they **pop** after a fuse and you score points.
- **Fruit Merge**: if 2+ of the same fruit touch, they **merge** after a fuse into the next bigger fruit.

Fuse rule (both modes): **3s base**, plus **+1s per extra fruit** in the touching group.

Merge mode win condition: make **10 diamonds**. (Diamond + diamond triggers a big shockwave.)

## Play locally

Serve the folder (recommended; some browsers restrict features when opening `file://` directly):

```pwsh
cd D:\aaaScripts\Games
python -m http.server 5173
```

Then open:

- <http://localhost:5173/fruitpile.html>

## Controls

- **Touch / Mouse**: drag to aim, release to drop
- **Keyboard**: **Left Arrow** / **Right Arrow** to aim, **Space** (or Enter) to drop

## Backgrounds (Bing)

The game tries to use recent Bing backgrounds. Because Bing’s JSON endpoint does not allow browser CORS requests, `index.html` fetches the list via a **read-only proxy** (`r.jina.ai`).

If that fetch fails (offline, proxy blocked), it automatically falls back to built-in gradient backgrounds.

## Files

- `fruitpile.html` – the entire game (HTML/CSS/JS)
- `index.html` – (optional) helper page for backgrounds (if present)

## Notes

- Physics uses **Matter.js** via a CDN.
- If you want an *offline-only* version (no CDN, no proxy), tell me and I’ll vendor the dependencies and replace Bing backgrounds with local images.
