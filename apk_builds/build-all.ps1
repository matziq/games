# Build APKs for all current games using Capacitor.
# Prerequisites: Android Studio + Android SDK installed
# Run from d:\aaaScripts\Games: pwsh -NoProfile -ExecutionPolicy Bypass -File .\apk_builds\build-all.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$buildDir = $PSScriptRoot
$outputDir = Join-Path $buildDir 'output'

$androidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$androidStudioJbr = 'C:\Program Files\Android\Android Studio\jbr'
if (Test-Path $androidStudioJbr) {
    $env:JAVA_HOME = $androidStudioJbr
    $env:Path = "$androidStudioJbr\bin;$env:Path"
}
if (Test-Path $androidSdk) {
    $env:ANDROID_HOME = $androidSdk
    $env:ANDROID_SDK_ROOT = $androidSdk
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Remove-Item (Join-Path $outputDir '*.apk') -Force -ErrorAction SilentlyContinue

# Game definitions: source HTML, app name, package ID
$games = @(
    @{ id = 'neon_pulse'; src = 'neon_pulse/index.html'; name = 'Neon Pulse'; pkg = 'com.matziq.neonpulse' },
    @{ id = '2048'; src = '2048/2048.html'; name = '2048'; pkg = 'com.matziq.g2048' },
    @{ id = 'bee'; src = 'bee/bee.html'; name = 'Bee'; pkg = 'com.matziq.bee' },
    @{ id = 'betris'; src = 'betris/betris.html'; name = 'Betris'; pkg = 'com.matziq.betris' },
    @{ id = 'blood_joust'; src = 'blood_joust/blood_joust.html'; name = 'Blood Joust'; pkg = 'com.matziq.bloodjoust' },
    @{ id = 'domino_combo'; src = 'domino_combo/dist/index.html'; name = 'Domino Combo'; pkg = 'com.matziq.dominocombo' },
    @{ id = 'fruitpile'; src = 'fruitpile/fruitpile.html'; name = 'FruitPile'; pkg = 'com.matziq.fruitpile' },
    @{ id = 'geodes'; src = 'geodes/geodes.html'; name = 'Geodes'; pkg = 'com.matziq.geodes'; orientation = 'portrait' },
    @{ id = 'real_or_ai'; src = 'real_or_ai/real_or_ai.html'; name = 'Real or AI'; pkg = 'com.matziq.realorai' },
    @{ id = 'treasure_aztecs'; src = 'treasure_aztecs/treasure.html'; name = 'Treasure Aztecs'; pkg = 'com.matziq.treasureaztecs' },
    @{ id = 'wordle'; src = 'wordle/wordle.html'; name = 'Wordle'; pkg = 'com.matziq.wordle' },
    @{ id = 'aztec_hero'; src = 'aztec_hero/aztech.html'; name = 'Aztec Hero'; pkg = 'com.matziq.aztechero'; vite = $true; distHtml = 'aztech.html' }
)

function Remove-DirectoryIfExists($path) {
    if (Test-Path $path) {
        attrib -R "$path\*" /S /D 2>$null
        try {
            Remove-Item $path -Recurse -Force -ErrorAction Stop
        }
        catch {
            cmd /c "rd /s /q `"$path`"" 2>$null | Out-Null
        }
    }
}

function Stop-AndroidJavaBuildProcesses {
    if (!(Test-Path $androidStudioJbr)) { return }
    Get-Process -Name java, javaw -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($androidStudioJbr, [System.StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Copy-SharedAssets($wwwDir) {
    $scriptsDir = Join-Path $wwwDir 'scripts'
    $srcScripts = Join-Path $root 'scripts'
    if (Test-Path $srcScripts) {
        New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
        Copy-Item (Join-Path $srcScripts '*') $scriptsDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Copy-Item (Join-Path $root 'favicon.svg') $wwwDir -Force -ErrorAction SilentlyContinue
}

function Write-FullscreenAndroidFiles($game, $projDir) {
    $pkgPath = $game.pkg.Replace('.', '\')
    $javaDir = Join-Path $projDir "android\app\src\main\java\$pkgPath"
    New-Item -ItemType Directory -Path $javaDir -Force | Out-Null
    $javaFile = Join-Path $javaDir 'MainActivity.java'
    @"
package $($game.pkg);

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
"@ | Set-Content $javaFile -Encoding UTF8

    $stylesFile = Join-Path $projDir 'android\app\src\main\res\values\styles.xml'
    @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowActionBar">false</item>
        <item name="android:windowFullscreen">true</item>
        <item name="android:windowDrawsSystemBarBackgrounds">true</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowFullscreen">true</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="android:windowFullscreen">true</item>
    </style>
</resources>
'@ | Set-Content $stylesFile -Encoding UTF8

    if ($game.orientation) {
        $manifestFile = Join-Path $projDir 'android\app\src\main\AndroidManifest.xml'
        $manifest = Get-Content $manifestFile -Raw
        if ($manifest -notmatch 'android:screenOrientation=') {
            $manifest = $manifest -replace 'android:name="\.MainActivity"', "android:name=`".MainActivity`"`r`n            android:screenOrientation=`"$($game.orientation)`""
            Set-Content $manifestFile $manifest -Encoding UTF8
        }
    }
}

$summary = @()

foreach ($game in $games) {
    $projDir = Join-Path $buildDir $game.id
    $wwwDir = Join-Path $projDir 'www'

    Write-Host "`n=== Building $($game.name) ===" -ForegroundColor Cyan

    # Create project directory
    if (!(Test-Path $projDir)) {
        New-Item -ItemType Directory -Path $projDir -Force | Out-Null
    }

    # Recreate www so stale files from deleted game variants do not leak into the APK.
    Remove-DirectoryIfExists $wwwDir
    New-Item -ItemType Directory -Path $wwwDir -Force | Out-Null

    if ($game.vite) {
        $viteDir = Join-Path $root 'aztec_hero'
        Push-Location $viteDir
        try {
            if (!(Test-Path 'node_modules')) {
                npm install
                if ($LASTEXITCODE -ne 0) { throw "npm install failed for $($game.id)" }
            }
            Copy-Item 'aztech.html' 'index.html' -Force
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "npm run build failed for $($game.id)" }
        }
        finally {
            Remove-Item 'index.html' -Force -ErrorAction SilentlyContinue
            Pop-Location
        }
        $distDir = Join-Path $viteDir 'dist'
        Copy-Item (Join-Path $distDir '*') $wwwDir -Recurse -Force
        $distHtml = Join-Path $wwwDir $game.distHtml
        if (Test-Path $distHtml) {
            Move-Item $distHtml (Join-Path $wwwDir 'index.html') -Force
        }
    }
    else {
        $srcPath = Join-Path $root $game.src
        if (!(Test-Path $srcPath)) {
            throw "Missing source file for $($game.id): $srcPath"
        }
        Copy-Item $srcPath (Join-Path $wwwDir 'index.html') -Force
    }

    Copy-SharedAssets $wwwDir

    # For Real or AI, copy images and manifest
    if ($game.id -eq 'real_or_ai') {
        $aiDir = Join-Path $wwwDir 'ai'
        $realDir = Join-Path $wwwDir 'real'
        New-Item -ItemType Directory -Path $aiDir -Force | Out-Null
        New-Item -ItemType Directory -Path $realDir -Force | Out-Null
        Copy-Item (Join-Path $root 'real_or_ai\ai\*') $aiDir -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $root 'real_or_ai\real\*') $realDir -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $root 'real_or_ai\image_manifest.js') $wwwDir -Force -ErrorAction SilentlyContinue
    }

    # Create package.json
    $pkgJson = @{
        name    = $game.id
        version = '1.0.0'
        private = $true
    } | ConvertTo-Json
    Set-Content (Join-Path $projDir 'package.json') $pkgJson -Encoding UTF8

    # Create capacitor.config.json
    $capConfig = @{
        appId   = $game.pkg
        appName = $game.name
        webDir  = 'www'
        server  = @{
            androidScheme = 'https'
        }
    } | ConvertTo-Json -Depth 3
    Set-Content (Join-Path $projDir 'capacitor.config.json') $capConfig -Encoding UTF8

    # Copy node_modules from parent (shared Capacitor install)
    $nmSrc = Join-Path $buildDir 'node_modules'
    $nmDst = Join-Path $projDir 'node_modules'
    if (!(Test-Path $nmDst)) {
        # Use junction for speed (avoids copying hundreds of MB)
        cmd /c mklink /J "$nmDst" "$nmSrc" 2>&1 | Out-Null
    }

    # Add Android platform
    Push-Location $projDir
    try {
        if (!(Test-Path 'android')) {
            Write-Host "  Adding Android platform..."
            npx cap add android 2>&1 | Select-Object -Last 2
            if ($LASTEXITCODE -ne 0) { throw "npx cap add android failed for $($game.id)" }
        }
        Write-Host "  Syncing web assets..."
        npx cap sync android 2>&1 | Select-Object -Last 2
        if ($LASTEXITCODE -ne 0) { throw "npx cap sync android failed for $($game.id)" }

        # Fix capacitor.settings.gradle path (junction-safe relative path)
        $capSettings = Join-Path $projDir 'android\capacitor.settings.gradle'
        @"
// DO NOT EDIT THIS FILE! IT IS GENERATED EACH TIME "capacitor update" IS RUN
include ':capacitor-android'
project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')
"@ | Set-Content $capSettings -Encoding UTF8

        Write-FullscreenAndroidFiles $game $projDir

        $androidDir = Join-Path $projDir 'android'
        foreach ($relative in @('app\build', 'capacitor-cordova-android-plugins\build', 'build', '.gradle')) {
            Remove-DirectoryIfExists (Join-Path $androidDir $relative)
        }
        Stop-AndroidJavaBuildProcesses
        Remove-DirectoryIfExists (Join-Path $buildDir 'node_modules\@capacitor\android\capacitor\build')
        Remove-DirectoryIfExists (Join-Path $projDir 'node_modules\@capacitor\android\capacitor\build')

        Write-Host "  Assembling APK..."
        Push-Location $androidDir
        try {
            & .\gradlew.bat assembleDebug --no-daemon
            if ($LASTEXITCODE -ne 0) { throw "Gradle assembleDebug failed for $($game.id)" }
        }
        finally {
            Pop-Location
        }

        $apkPath = Join-Path $androidDir 'app\build\outputs\apk\debug\app-debug.apk'
        $destApk = Join-Path $outputDir "$($game.id).apk"
        if (!(Test-Path $apkPath)) {
            throw "APK was not produced: $apkPath"
        }
        Copy-Item $apkPath $destApk -Force
        $summary += [pscustomobject]@{ Game = $game.id; Status = 'built'; Apk = $destApk }

        Write-Host "  Done: $($game.name)" -ForegroundColor Green
    }
    catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
        $summary += [pscustomobject]@{ Game = $game.id; Status = 'failed'; Apk = $null; Error = "$($_)" }
    }
    Pop-Location
}

$summary | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $outputDir 'build-summary.json') -Encoding UTF8

Write-Host "`n=== APK build complete ===" -ForegroundColor Green
Write-Host "Output folder: $outputDir"
