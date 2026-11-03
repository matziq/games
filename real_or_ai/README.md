# Real or AI

Each game shows up to 20 rounds. A round uses a matched pair such as `real_0023.jpg` and `ai_0023.jpg` (same number and supported image extension). Which image is on the left is a fresh cryptographic coin flip, so the AI image is not stuck on one side.

If the sign folder contains images, a round is included only when its matching `ai_sign/ai_sign_0023.jpg` also exists. After a choice, the AI box swaps to that sign; it is not shown beforehand, and the real image stays put. If there are no sign images, matched real/AI pairs can still be played.

The game fills the window when it opens. Click a photo to view it full size, scroll to zoom, and drag while zoomed.

## Run

- Open `real_or_ai.html` in your browser.
- Or open the repo menu: `../gamemenu.html`.

## Why images sometimes don't load

When you open `real_or_ai.html` directly (via `file://`), browsers usually block JavaScript from listing folders or probing files reliably.

So the game loads a small **manifest file** (`image_manifest.js`) containing the explicit image lists. The generator recognizes `.jpg`, `.jpeg`, `.png`, `.gif`, and `.webp` files.

## Regenerate the manifest

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-real-or-ai-manifest.ps1 -MaxPerFolder 100
```

That rebuilds `real_or_ai/image_manifest.js` from number-matched files. It does not renumber files. If any sign images exist, only pairs with a matching sign are included. `-MaxPerFolder 100` caps the number of complete pairs; use `-MaxPerFolder 0` to include every eligible pair.

## Folder structure

- `real_or_ai/real_or_ai.html`
- `real_or_ai/image_manifest.js` (generated)
- `real_or_ai/ai/*` (AI images)
- `real_or_ai/ai_sign/*` (shown in the AI box only after a choice)
- `real_or_ai/real/*` (real images)
