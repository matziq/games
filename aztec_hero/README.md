# Aztec Hero

A vertical 8-bit-style Phaser platformer: climb nine underground ruin rooms, outrun rising water, collect gems, fight creatures, and reach the exit.

## Controls

| Action | PC | Mobile / touch |
| --- | --- | --- |
| Move | `A` / `D` or Left / Right | Direction pad |
| Climb ladder | `W` / `S` or Up / Down | Up / Down |
| Jump / release early for a shorter jump | `Space` | Jump button |
| Loot / pick up / swing torch | `E` | E button |
| Restart after escape or death | `R` or `Space` | Restart button |

Keyboard controls remain active on desktop and touch-capable laptops. Touch controls appear only in coarse-pointer or touch contexts, support multiple simultaneous pointers, and respect device safe areas.

## Development

Requires Node.js 20 or later.

```powershell
npm install
npm run dev
```

Vite serves the game on port 8010. The production build is self-contained under `dist` and uses relative URLs (`base: './'`) so it works in Capacitor and from subdirectories.

On a PC, open `dist\index.html` directly or launch it through the games menu.
The production build uses a classic bundled script so `file://` launches do
not require a local server. The root `index.html` is the TypeScript development
entry for `npm run dev`; opening it directly redirects to the built game.

```powershell
npm test
npm run typecheck
npm run build
```

## Android

The Capacitor app ID is `com.matziq.aztechero` and the app name is **Aztec Hero**.

```powershell
# Build web assets and copy them into the native project
npm run android:sync

# Build a debug APK
npm run android:debug
```

The debug APK is written to:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

`android:debug` requires a working JDK and Android SDK accepted by Gradle. Set `JAVA_HOME` and `ANDROID_HOME` (or create `android\local.properties` with `sdk.dir=...`) when they are not already configured. Use `npm run android:open` to open the native project in Android Studio.

The Android project is checked in. If it ever needs to be regenerated, remove only the `android` directory and run `npm run android:add`, then `npm run android:sync`.

## Gameplay behavior

- Room progress is bottom-up: Room 1 at the starting chamber and Room 9 at the exit.
- Coyote time, jump buffering, and variable jump height make jumps more forgiving without changing the level.
- Ladders remain usable while carrying a torch.
- Switching apps, hiding the page, or losing focus pauses simulation and ambient audio. Returning resets Phaser's frame clock and clamps the first frame so water and oxygen cannot jump.
- Escape and death both stop simulation and expose explicit keyboard and touch restart controls.
