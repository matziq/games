# Real or AI

Each round shows one matched pair at the same time: `real_0023.jpg` and `ai_0023.jpg` (same number, any extension). Which image is on the left is a fresh cryptographic coin flip, so the AI image is not stuck on one side.

After a choice, the AI box swaps to `ai_sign/ai_sign_0023.jpg`. That sign is not shown before the choice. The real image stays put.

The game fills the window when it opens. Click a photo to view it full size, scroll to zoom, and drag while zoomed.

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

That rebuilds `real_or_ai/image_manifest.js` from number-matched pairs (`real_0023` with `ai_0023` and `ai_sign_0023` when that file exists). It does not renumber files. `-MaxPerFolder 100` caps complete pairs. Use `-MaxPerFolder 0` to include every pair.

## Folder structure

- `real_or_ai/real_or_ai.html`
- `real_or_ai/image_manifest.js` (generated)
- `real_or_ai/ai/*` (AI images)
- `real_or_ai/ai_sign/*` (shown in the AI box only after a choice)
- `real_or_ai/real/*` (real images)
