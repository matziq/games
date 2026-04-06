$results = @()
$results += "=== Android SDK Check ==="
$results += "Android Studio: $(Test-Path 'C:\Program Files\Android\Android Studio')"

$sdkPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "$env:ANDROID_HOME",
    "$env:ANDROID_SDK_ROOT",
    "C:\Android\Sdk"
)

foreach ($p in $sdkPaths) {
    if ($p -and (Test-Path $p)) {
        $results += "SDK FOUND at: $p"
        $env:ANDROID_HOME = $p
        break
    }
}

if (-not $env:ANDROID_HOME) {
    # Try to install SDK command line tools
    $results += "SDK NOT FOUND - attempting install via winget..."
    $results += (winget install Google.AndroidStudio --accept-package-agreements --accept-source-agreements 2>&1 | Out-String)
}

$results += "=== ANDROID_HOME: $env:ANDROID_HOME ==="

# Try building first game as test
if ($env:ANDROID_HOME -and (Test-Path "$env:ANDROID_HOME\platforms")) {
    Set-Location d:\aaaScripts\Games\apk_builds\2048\android
    $results += "=== Building 2048 ==="
    $results += (.\gradlew.bat assembleDebug 2>&1 | Out-String)
}

$results | Out-File -FilePath "d:\aaaScripts\Games\apk_builds\_results.txt" -Encoding UTF8
