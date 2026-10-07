# Real or AI

Each round shows one matched pair at the same time: `real_0023.jpg` and `ai_0023.jpg` (same number, any extension). Which image is on the left is a fresh cryptographic coin flip, so the AI image is not stuck on one side.

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

That rebuilds `real_or_ai/image_manifest.js` from number-matched pairs (`real_0023` with `ai_0023`). It does not renumber files. `-MaxPerFolder 100` caps complete pairs. Use `-MaxPerFolder 0` to include every pair.

## Folder structure

- `real_or_ai/real_or_ai.html`
- `real_or_ai/image_manifest.js` (generated)
- `real_or_ai/ai/*` (AI images)
- `real_or_ai/real/*` (real images)
