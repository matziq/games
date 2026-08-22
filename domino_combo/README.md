# Domino Combo

A match-3 dice placement game. Drag dominoes onto the board, match 3+ same tiles
to merge them into the next value, and chain reactions for bonus points.

Choose one of three game modes whenever the game launches:

- **Classic** — merges resolve in place; no board-wide reshuffling.
- **Chaos** — matching 4+ tiles valued 1-5 or 3+ sixes collapses the board
  downward, while Hard mode still requires four of any value. Four or more
  sixes explode every neighboring tile for bonus points before the collapse.
- **Ultimate Chaos** — uses the same thresholds and explosions as Chaos, but
  matching 4+ sixes reverses gravity and makes every survivor fall upward.

Difficulty is separate from the game mode and is changed in **Settings**. It
controls which pieces spawn, and each difficulty keeps its own high scores:

- **Regular** — mostly two-value dominoes (the original behavior).
- **Easy** — single dice only, locked to the 5×5 board with match 3.
- **Noob** — single dice only, but board size and match count stay adjustable.
- **Snake Eyes** — always twin doubles (the same value on both halves), falling
  back to a single die when no double fits on the board.

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
```

## Tooling

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Start the Vite dev server                             |
| `npm run build`   | Build a single self-contained `dist/index.html`       |
| `npm run android:sync` | Build the web app and copy it into the Android project |
| `npm run android:build:debug` | Build an installable debug APK on Windows       |
| `npm run android:open` | Open the native project in Android Studio            |
| `npm run preview` | Preview the production build                          |
| `npm test`        | Run the Vitest suite once                             |
| `npm run test:watch` | Run Vitest in watch mode                            |
| `npm run lint`    | Lint with ESLint (flat config)                        |

## Android APK

The Capacitor project in `android/` packages the same production web build used
by GitHub Pages. On Windows, set `JAVA_HOME` to Android Studio's bundled JDK and
`ANDROID_HOME` to the Android SDK, then run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'D:\DevTools\android-sdk'
npm run android:build:debug
```

The installable APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`.
