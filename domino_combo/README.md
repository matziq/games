# Domino Combo

A match-3 dice placement game. Drag dominoes onto the board, match 3+ same tiles
to merge them into the next value, and chain reactions for bonus points.

The game uses one unnamed ruleset on a fixed 5×5 board with the original
Regular-style piece mix. Matching 4+ tiles collapses the board in a random
direction. During a collapse cascade, a match of 3+ causes another collapse
(subject to the configured match count). Matching 5+ earns a **Remix Token**
that scrambles the board. Matching 4+ sixes also destroys neighboring tiles.
High-score names can be submitted with Enter.

Settings retain the match-threshold and sound controls. Gameplay type,
difficulty, and board size are fixed and have no selectors.

## Play

- **Quick play:** run `npm run build` and open `dist/index.html` — it's a single,
  self-contained file (all CSS/JS inlined), so it works by double-clicking.
- **Dev server:** `npm run dev` and open the printed URL (module-based, with HMR).

Do not double-click the root `index.html`; it is the source entry point and
requires Vite to serve its JavaScript modules. For offline play, always use the
built `dist/index.html`.

Sound can be toggled without restarting from the switch above the board.
Full-screen mode is never automatic; use the adjacent full-screen button when
you want it.

## Project structure

```
index.html        markup + styles; loads src/main.js as a module
src/logic.js      pure, DOM-free game logic (single source of truth, unit-tested)
src/main.js       DOM rendering, audio, drag/drop, and event wiring
test/             Vitest suites (pure logic + jsdom bootstrap smoke tests)
scripts/          APK asset equality and compiled-game behavior checks
```

## Tooling

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                             |
| `npm run build`   | Build a single self-contained `dist/index.html`       |
| `npm run preview` | Preview the production build                          |
| `npm test`        | Run the Vitest suite once                             |
| `npm run test:watch` | Run Vitest in watch mode                            |
| `npm run lint`    | Lint with ESLint (flat config)                        |

## Android APK

The Capacitor project in `../apk_builds/domino_combo/android/` packages the
production web build. From the repository root on Windows, set `JAVA_HOME` to
Android Studio's bundled JDK and `ANDROID_HOME` to the Android SDK, then run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'D:\DevTools\android-sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Set-Location domino_combo
npm ci
npm run build
Set-Location ..\apk_builds
npm ci
Copy-Item ..\domino_combo\dist\* domino_combo\www\ -Recurse -Force
Set-Location domino_combo
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
```

The installable APK is written to
`apk_builds/domino_combo/android/app/build/outputs/apk/debug/app-debug.apk`.

Alternatively, run **Build Domino Combo APK** from GitHub Actions. It installs
the current Android SDK packages without the obsolete `tools` package, builds
the web app and debug APK, verifies its package metadata and signature, checks
every packaged web asset against the production build, executes the bundled
game to check its current UI and controls, and
uploads the `domino-combo-apk` artifact. The published download is
`domino_combo/domino_combo.apk`; a workflow run alone does not update that
checked-in file.

## Gameplay source of truth

The canonical gameplay source is
[`matziq/domino-combo`](https://github.com/matziq/domino-combo). This copy was
synchronized through revision `57977cb6c2f7666bacc6f1ce4f47e62a22ca1c8a` on
October 22, 2026. It uses one unnamed game, a fixed 5×5 board, the original
Regular-style piece mix, remix tokens, directional cascades, and
Enter-to-submit high scores.

When the canonical game changes, synchronize `index.html`, `src/`, `public/`,
and its regression tests into this folder, run tests/lint/build, and publish
both `dist/` and the APK. Keep this repository's shared Android packaging and
package ID `com.matziq.dominocombo`. The APK workflow compares gameplay inputs
with canonical `main` and fails on divergence instead of silently shipping an
older copy. APK version 1.2 (code 3) identifies the simplified game.
