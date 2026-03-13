# Real or AI

This game picks 1 image from `ai/` and 1 image from `real/` each round.

## Run

- Open `real_or_ai.html` in your browser.
- Or open the repo menu: `../gamemenu.html`.

## Why images sometimes don't load

When you open `real_or_ai.html` directly (via `file://`), browsers usually block JavaScript from listing folders or probing files reliably.

So this game uses a small **manifest file** (`image_manifest.js`) that contains the explicit list of images.

## Regenerate the manifest

From the repo root (`D:\aaaScripts\Games`), run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-real-or-ai-manifest.ps1 -MaxPerFolder 100
```

That will rebuild `real_or_ai/image_manifest.js` using the first 100 images from each folder.

## Folder structure

- `real_or_ai/real_or_ai.html`
- `real_or_ai/image_manifest.js` (generated)
- `real_or_ai/ai/*` (AI images)
- `real_or_ai/real/*` (real images)
