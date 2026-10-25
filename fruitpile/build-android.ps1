param(
    [string]$OutputRoot = 'D:\AI_Output\Fruitpile_PC_and_mobile',
    [string]$JavaHome = '',
    [string]$PlatformJar = '',
    [string]$BuildTools = ''
)
$ErrorActionPreference = 'Stop'
# package.json is the single source of truth for the version; the manifest must agree with it.
$version = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "package.json has an invalid version: $version" }
[xml]$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'android\AndroidManifest.xml')
$manifestVersion = $manifest.manifest.GetAttribute('versionName', 'http://schemas.android.com/apk/res/android')
if ($manifestVersion -ne $version) { throw "AndroidManifest.xml versionName ($manifestVersion) does not match package.json ($version)" }
$htmlName = "FruitPile-$version.html"
$apkName = "FruitPile-$version-test.apk"
if (!$JavaHome) { $JavaHome = Join-Path $OutputRoot 'toolchain\jdk-21.0.12.1+1' }
if (!$PlatformJar) { $PlatformJar = Join-Path $OutputRoot 'toolchain\android-36\android.jar' }
if (!$BuildTools) { $BuildTools = Join-Path $OutputRoot 'toolchain\android-16' }
foreach ($file in @("$JavaHome\bin\javac.exe", $PlatformJar, "$BuildTools\aapt2.exe", "$BuildTools\lib\d8.jar", "$BuildTools\lib\apksigner.jar")) {
    if (!(Test-Path -LiteralPath $file)) { throw "Missing build dependency: $file. See README build prerequisites." }
}
$env:JAVA_HOME = $JavaHome
$env:TEMP = Join-Path $OutputRoot 'temp'
$env:TMP = $env:TEMP
$stage = Join-Path $OutputRoot 'android-build'
$assets = Join-Path $stage 'assets'
$classes = Join-Path $stage 'classes'
$dex = Join-Path $stage 'dex'
New-Item -ItemType Directory -Force $OutputRoot,$stage,$assets,$classes,$dex,$env:TEMP | Out-Null
function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed with exit code $LASTEXITCODE" }
}
Invoke-Checked 'node' @((Join-Path $PSScriptRoot 'build.mjs'), $OutputRoot)
Copy-Item (Join-Path $OutputRoot $htmlName) (Join-Path $assets 'index.html') -Force
Invoke-Checked "$BuildTools\aapt2.exe" @('compile', '--dir', "$PSScriptRoot\android\res", '-o', "$stage\resources.zip")
Invoke-Checked "$BuildTools\aapt2.exe" @('link', '-o', "$stage\unsigned.apk", '-I', $PlatformJar,
    '--manifest', "$PSScriptRoot\android\AndroidManifest.xml", '-A', $assets, "$stage\resources.zip")
Invoke-Checked "$JavaHome\bin\javac.exe" @('-encoding', 'UTF-8', '-source', '8', '-target', '8',
    '-bootclasspath', $PlatformJar, '-d', $classes, "$PSScriptRoot\android\MainActivity.java")
Invoke-Checked "$JavaHome\bin\jar.exe" @('--create', '--file', "$stage\classes.jar", '-C', $classes, '.')
Invoke-Checked "$JavaHome\bin\java.exe" @('-cp', "$BuildTools\lib\d8.jar", 'com.android.tools.r8.D8',
    '--lib', $PlatformJar, '--min-api', '24', '--output', $dex, "$stage\classes.jar")
Invoke-Checked "$JavaHome\bin\jar.exe" @('uf', "$stage\unsigned.apk", '-C', $dex, 'classes.dex')
Invoke-Checked "$BuildTools\zipalign.exe" @('-f', '4', "$stage\unsigned.apk", "$stage\aligned.apk")
$key = Join-Path $OutputRoot 'private\fruitpile-test.jks'
if (!(Test-Path -LiteralPath $key)) {
    New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
    # Standard disposable test identity, not a production signing credential.
    Invoke-Checked "$JavaHome\bin\keytool.exe" @('-genkeypair', '-keystore', $key, '-storepass', 'android',
        '-alias', 'androiddebugkey', '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US')
}
$apk = Join-Path $OutputRoot $apkName
Invoke-Checked "$JavaHome\bin\java.exe" @('-jar', "$BuildTools\lib\apksigner.jar", 'sign', '--ks', $key,
    '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $apk, "$stage\aligned.apk")
Invoke-Checked "$JavaHome\bin\java.exe" @('-jar', "$BuildTools\lib\apksigner.jar", 'verify', '--verbose', '--print-certs', $apk)
Invoke-Checked "$BuildTools\zipalign.exe" @('-c', '4', $apk)
$badging = & "$BuildTools\aapt2.exe" dump badging $apk
if ($LASTEXITCODE -ne 0) { throw "aapt2 dump badging failed with exit code $LASTEXITCODE" }
$badging
if (!($badging | Select-String -SimpleMatch "versionName='$version'" -Quiet)) { throw "APK versionName is not $version" }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
    $asset = $zip.GetEntry('assets/index.html')
    if (!$asset -or !$zip.GetEntry('classes.dex') -or !$zip.GetEntry('AndroidManifest.xml')) { throw 'APK is incomplete' }
    $reader = [System.IO.StreamReader]::new($asset.Open())
    try { $packed = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $release = [System.IO.File]::ReadAllText((Join-Path $OutputRoot $htmlName))
    if ($packed -cne $release) { throw 'APK contains stale HTML' }
} finally { $zip.Dispose() }
$hashes = @($htmlName, $apkName) | ForEach-Object {
    "$((Get-FileHash (Join-Path $OutputRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant())  $_"
}
[System.IO.File]::WriteAllLines((Join-Path $OutputRoot 'SHA256SUMS.txt'), $hashes)
Write-Output "Built and verified $apk (test-signed; not a Play Store release)"
