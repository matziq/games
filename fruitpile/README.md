# FruitPile 2.1

An offline fruit-physics game for mouse, keyboard and touch, laid out for phones
first. Both modes use the same 520 x 680 logical bowl on every screen, so a wider
monitor no longer buys extra room. Resizing or rotating scales the view without
moving the pile.

## Play

Open `fruitpile.html` with the `vendor` folder beside it, or open the single-file
`FruitPile-2.1.0.html` release directly. No server, account or network is needed.
The first two fruit are cherries: drop them in the same place for a quick first
match. The drop preview, upcoming fruit and current objective stay visible on
phones, including narrow 320px screens and landscape.

| Mode | What to do | Progress |
| --- | --- | --- |
| Explode | Touch matching fruit together to pop the group. Bigger groups and quick chains score more. | Reach the next score milestone, then beat your local best. Smaller fruit have higher base values. |
| Merge | Touch matching fruit together to create the next larger fruit. A group creates one next-size fruit; extra fruit increase the score. | Grow Cherry > Grape > Strawberry > Orange > Apple > Peach > Melon > Watermelon > Diamond. Celebrate the first diamond, then continue the same run. Larger fruit have higher base values. |

Matches have a **0.75-second fuse, plus 0.25 seconds per extra touching fruit**.
Bigger fruit are heavier: mass follows volume, so a watermelon shoves the pile harder than a cherry at the same speed. They do not fall faster.
In both Explode and Merge, the fruit must still be touching when the fuse ends.
Bouncing apart cancels that fuse; it does not pop or merge later. A watermelon blast creates **one**
diamond. Two diamonds are created only by two separate blasts, so one blast cannot
immediately detonate its own reward.
Match again within **3 seconds** to extend the combo (maximum 5x); its small
timer shows how much time is left. In Merge, the progress bar tracks the largest
fruit you have created. In Explode, it tracks the next score target.

Small fruit are always in the random pool. Matching all three small types unlocks
Orange, Apple and Peach. Matching all three medium types unlocks Melon and
Watermelon. Diamonds never drop randomly; two touching diamonds make a shockwave.

Settled fruit above the dashed line show a **3-second danger countdown**. Clear
them before it expires. Falling fruit get a grace period. Two quick drops are
allowed before the game waits for the latest fruit to land.

**Classic** is the default: no random wind or fruit decay. **Chaos**, selected
in the menu for the next run, restores the original gusts and decay (fruit
start attracting flies after 20 idle seconds and shrink 4 seconds later).
A hit from another fruit scares the fly onto a different fruit and restarts its timer.
Classic and Chaos have separate score tables.

## Mobile play (new in 2.1)

The touch experience is built around holding a phone in one hand, in the style of
popular one-thumb fruit-merge games:

- **The whole board is the controller.** Touch anywhere on the play area, not just
  on the bowl, and the fruit follows your finger. Lift to drop. A drop needs the
  finger to finish on the board (with a small margin), so sliding off the screen
  edge or an interrupted touch cancels safely.
- **A thumb bar under the board.** Large Left and Right arrows, a wide Drop button
  that shows the current fruit, and Swap. A tap on an arrow nudges the aim;
  holding it glides the aim and speeds up the longer you hold. Every target is at
  least 44px, and the bar sits in the lower, easy-to-reach part of the screen.
- **The board gets the screen.** On portrait phones the bowl uses the full width,
  with a compact score, goal, combo and next-fruit bar above it. Tips float over
  that bar, so they never resize or shift the board. Short landscape
  phones switch to a three-part layout: stats and Left/Right on the left, the
  board in the middle, and Drop/Swap under the right thumb. The start menu becomes
  two columns there, so Play and the settings never scroll apart.
- **Safe areas.** Notches, rounded corners, gesture bars and the on-screen keyboard
  are respected (`viewport-fit=cover`, safe-area insets, resizing content).
- **No stray browser gestures.** Pull-to-refresh, double-tap zoom, text selection,
  the long-press menu and page scrolling are suppressed on the board and the
  controls. The page does not disable browser zoom for accessibility.
- **Haptics.** A light tick on swap, a short pulse on drop, pops that grow with the
  size of the match, a triple pulse for the diamond shockwave, a warning buzz when
  the danger countdown starts, and a long pulse at game over. A **Vibration** switch
  in the menu turns them off. It only appears on devices that can vibrate, and the
  choice is remembered locally.
- **The screen stays awake only while you are actively playing** (the browser's
  Screen Wake Lock, or a native flag in the Android app). The menu, pause, game
  over, switching apps and backgrounding all release it.
- **Help is not a dead end.** The `How it works` button turns into `Back to menu`
  while the help panel is open, and the panel shows touch hints on touch screens
  and keyboard hints elsewhere.

## Controls and accessibility

| Action | Pointer / touch | Keyboard |
| --- | --- | --- |
| Aim and drop | Press anywhere on the board area and drag to aim, release to drop; a tap drops where you tap | Left / Right to aim; Space / Enter to drop |
| Fine adjustment | Left / Right buttons: tap to nudge, hold to glide; then Drop | Arrow keys repeat while held |
| Swap current and next | Swap, once per successful drop | S |
| Pause, help, settings, local scores | Menu (pause) button | P or Escape |

Releasing well outside the board or cancelling a gesture does not drop. Right
clicks, secondary pointers and keys typed in a name field cannot drop fruit.
Interactive targets are at least 44px. Menus scroll on small screens, trap keyboard
focus and do not play the game underneath. Sound, vibration and reduced effects
persist locally; reduced effects defaults to the operating system's reduced-motion
preference.

Physics runs in fixed 60Hz steps with bounded catch-up. Fuse, combo, danger,
wind and decay timers all use the simulation clock. Menus, app switching, window
blur and backgrounding pause that clock and audio. **Returning never resumes
automatically.** A restart requires confirmation and clears old match queues.
The Android Back action steps back one level at a time: it closes high scores or
the help panel, then pauses an active run into the menu, then resumes a paused
run from the menu. Back only leaves the app from the start menu or the game-over
screen.

Local scores use the new `fruitpile.highscores.v2` storage key, separated by mode
and Classic/Chaos. Old scores are left untouched because the board and scoring
rules changed; they are not comparable. There is no cloud score upload, tracking,
external background service or CDN. Storage failures are reported without
preventing play. Active runs are not saved across page reloads or Android process
death; only settings and saved scores persist.

## Why the original may not have held people's interest

These are code-grounded hypotheses, not measured retention findings:

- Mobile hid the current/next fruit, mode and goal, removing planning information.
- Documentation, help and actual fuse/win values disagreed.
- Merge rewarded cherries more than large fruit, opposing the advertised goal.
- Early random gusts and 12-second decay undid setups before players understood them.
- A 20-diamond goal was remote, while the 1.2-second combo window was shorter
  than many falls and group fuses. Much of the payoff could feel accidental.

This version makes near-term progress and timing visible, aligns Merge scoring,
offers a small deliberate decision (one swap per drop), and puts the old chaotic
rules behind an explicit setting. It does not add a collection of unrelated
power-ups, accounts or artificial daily rewards.

### Small playtest before adding more features

Ask five people who have not played to try it without coaching, across at least
one real Android phone and a desktop. Observe whether they make the first match,
notice the next fruit/swap, explain the two modes and know why a run ended.
After one loss, offer no prompt and note whether they choose a second run.
Ask what felt planned versus random and what they were trying to achieve next.
Record observations locally, not via hidden analytics. Compare Classic and
Chaos only after each participant understands Classic. Tune bowl pressure,
score milestones and spawn probabilities from this evidence; the current
balance is an informed starting point, not a proven retention improvement.

Remaining opportunities, subject to playtesting: saving an in-progress run,
more legible fruit recognition for low-vision players, and a deterministic
daily puzzle if people actually want repeat challenges. The canvas board is
not a fully nonvisual/screen-reader-playable game.

## Reproducible builds

Keep all generated files outside the repository. Commands below use the task's
output root, `D:\AI_Output\Fruitpile_PC_and_mobile`. Maintained source, scripts,
tests and vendored engine stay here; npm caches, portable tools, temporary files,
test pictures, HTML and APK outputs stay in that output root.

### Standalone HTML

Requires Node.js 22+. The bundled Matter.js 0.20.0 source and MIT license are in
`vendor`; the generated HTML retains the engine's license header.

```powershell
node .\build.mjs 'D:\AI_Output\Fruitpile_PC_and_mobile'
```

The build refuses external script/link/image dependencies and creates
`FruitPile-<version>.html` (currently `FruitPile-2.1.0.html`, versioned from
`package.json`) plus its SHA-256 digest. The repository source also works
offline, but needs its sibling `vendor` folder.

### Browser tests

The lockfile pins Matter.js and Playwright. Restore test tools outside the repo:

```powershell
$out = 'D:\AI_Output\Fruitpile_PC_and_mobile'
New-Item -ItemType Directory -Force "$out\tools" | Out-Null
Copy-Item .\package.json,.\package-lock.json "$out\tools"
npm ci --prefix "$out\tools" --cache "$out\npm-cache" --no-audit --no-fund
$env:PLAYWRIGHT_BROWSERS_PATH = "$out\browsers"
node "$out\tools\node_modules\playwright\cli.js" install chromium
node .\build.mjs $out
node .\tests\game.test.mjs $out
```

Tests cover both actual match paths, scoring, fuse values, fixed-step parity at
30/60/120Hz, mouse/keyboard/touch input, cancellations, swap limits, pause/help/
scores/background lifecycle, restart queues, settings, Chaos/Classic separation,
diamond continuation and overflow grace. Layouts include 320x568, 360x800, 390x844,
412x915, 568x320, 667x375, 844x390, 915x412, 768x1024, 800x1280 and 1440x900 with
rotation invariance. Mobile coverage adds whole-board touch aiming and
release-outside cancellation, tap-versus-hold arrow gliding, the Vibration setting,
the Android bridge contract (vibration calls, keep-awake only while playing, Back
handling), the Back to menu help toggle, toasts that never resize the board,
touch/keyboard hints, gesture protection, observer-driven resizing, and a static
check that the manifest version and every bridge method the page calls match the
Java shell. Test-only hooks are injected into a routed copy; the shipped HTML has
no test API. Separate uninstrumented tests play the real standalone HTML offline
and capture live desktop/mobile gameplay after real animation frames.

Environment variables: `FRUITPILE_TOOLS` points at the folder holding the
restored `node_modules` when it is not `<output>\tools`, and
`FRUITPILE_TEST_FILTER` runs only tests whose name contains the given text (join
several with `|`), for example `$env:FRUITPILE_TEST_FILTER = 'touch aims|android'`.

### Android test APK

The maintained `android` folder is a small native WebView shell. It preserves
package ID **com.matziq.fruitpile**, increases versionCode to **7**, uses
versionName **2.1.0**, minimum API **24**, and target API **36**. It embeds exactly
the standalone HTML, requests no Internet permission, blocks external WebView
requests and has no third-party runtime dependency. Its only native hooks are a
tiny local `FruitPileNative` bridge (vibration and keep-screen-on) that the
bundled offline page alone can reach, and the `VIBRATE` permission it needs.

The shell is built for playing, not for viewing a web page:

- Full-screen sticky immersive mode: system bars stay hidden until an edge swipe,
  and the game extends under display cutouts while keeping controls clear of them.
- Rotation without restarting, with system-bar, cutout and keyboard insets handled.
- Adaptive launcher icon, including a monochrome layer for Android 13+ themed icons.
- Pinch zoom, system font scaling, forced dark mode, overscroll glow and the
  long-press menu are off, so the fixed game layout cannot be broken by them.
- Back steps out of help, high scores or a run before it ever exits the app.
- Notification-shade, system-dialog, split-screen and app-switch focus changes
  pause an active run. Returning never resumes automatically.
- The screen stays on only while a run is actively being played.
- Haptics through the device vibrator, controlled by the in-game Vibration setting.

Build prerequisites: a JDK (tested with Temurin 21.0.12.1+1), Android SDK Platform
36 and Android Build Tools 36.0.0. Existing licensed SDK installations can be
passed directly; the command does not run sdkmanager or accept license prompts.
For this task, official portable archives were extracted under `toolchain`
inside the output root, verified against these distributor checksums:

| Archive | Distributor checksum |
| --- | --- |
| `OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip` (Adoptium/Temurin GitHub release) | SHA-256 `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e` |
| `https://dl.google.com/android/repository/platform-36_r02.zip` | SHA-1 `2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576` |
| `https://dl.google.com/android/repository/build-tools_r36_windows.zip` | SHA-1 `f16ccffd34de8790dede813a6c7d8e2c11a27b50` |

```powershell
.\build-android.ps1
# Or use existing installations:
.\build-android.ps1 -OutputRoot 'D:\AI_Output\Fruitpile_PC_and_mobile' `
  -JavaHome 'C:\path\to\jdk' `
  -PlatformJar 'C:\path\to\sdk\platforms\android-36\android.jar' `
  -BuildTools 'C:\path\to\sdk\build-tools\36.0.0'
```

The script compiles Java/resources, creates DEX, aligns and signs the APK, checks
the signature and manifest, compares the embedded HTML with the release, and
writes `SHA256SUMS.txt`. No Gradle/OneDrive build cache is involved.

**`FruitPile-2.1.0-test.apk` is test-signed, not a Play Store production release.**
The disposable signing identity stays in `private\fruitpile-test.jks` under the
output root and is never committed or published. Share the HTML/APK/checksum
files, not the entire build folder. An existing installation can only be
upgraded in place by a build signed with the same key; 2.1.0 carries the same test
signer as 2.0.4, so it installs over it and keeps local scores. A differently
signed installation cannot be upgraded; do not remove it without considering its
local scores. Production distribution needs the owner's authorized signing key and
real-device acceptance testing.

This release has automated Chromium desktop/mobile-emulation coverage and
static APK signature, manifest, DEX and asset validation. No phone or emulator
was installed to or exercised during this task. Android-specific back behavior,
haptics, immersive mode, audio interruption, system insets and performance on
older phones still need real-device validation.
