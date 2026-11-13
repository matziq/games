param(
    [string]$OutputDirectory = 'D:\OneDrive\Scripts\games\emberkeep',
    [string]$SdkRoot = "$OutputDirectory\android-tools\sdk",
    [string]$JavaHome = ''
)
$ErrorActionPreference = 'Stop'
if (!$JavaHome) {
    if ($env:JAVA_HOME) { $JavaHome = $env:JAVA_HOME }
    else { $JavaHome = (Get-ChildItem "$OutputDirectory\android-tools\java" -Directory | Select-Object -First 1).FullName }
}
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"
$tools = Join-Path $SdkRoot 'build-tools\36.0.0'
$platform = Join-Path $SdkRoot 'platforms\android-36\android.jar'
foreach ($path in @("$JavaHome\bin\javac.exe", "$tools\aapt2.exe", $platform)) {
    if (!(Test-Path -LiteralPath $path)) { throw "Missing build dependency: $path" }
}
function Run([string]$command, [string[]]$arguments) {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "$command failed with exit code $LASTEXITCODE" }
}
$build = Join-Path $OutputDirectory 'android-build'
$assets = Join-Path $build 'assets'
$classes = Join-Path $build 'classes'
$dex = Join-Path $build 'dex'
New-Item -ItemType Directory -Force -Path $OutputDirectory,$build,$assets,$classes,$dex | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot\..\index.html" -Destination "$assets\index.html" -Force
$unsigned = Join-Path $build 'unsigned.apk'
$aligned = Join-Path $build 'aligned.apk'
$apk = Join-Path $OutputDirectory 'Emberkeep-Android.apk'
$resources = Join-Path $build 'resources.zip'
Run "$tools\aapt2.exe" @('compile','--dir',"$PSScriptRoot\res",'-o',$resources)
Run "$tools\aapt2.exe" @('link','-o',$unsigned,'-I',$platform,'--manifest',"$PSScriptRoot\AndroidManifest.xml",
    '-R',$resources,'-A',$assets,'--min-sdk-version','26','--target-sdk-version','36','--version-code','16','--version-name','1.15-auto-equipment')
Run "$JavaHome\bin\javac.exe" @('--release','8','-classpath',$platform,'-d',$classes,
    "$PSScriptRoot\src\org\matziq\emberkeep\MainActivity.java")
$classFiles = @(Get-ChildItem $classes -Filter '*.class' -Recurse | ForEach-Object { $_.FullName })
Run "$tools\d8.bat" (@('--lib',$platform,'--min-api','26','--output',$dex) + $classFiles)
Run "$JavaHome\bin\jar.exe" @('uf',$unsigned,'-C',$dex,'classes.dex')
Run "$tools\zipalign.exe" @('-f','-p','4',$unsigned,$aligned)
$key = Join-Path $OutputDirectory 'android-debug.keystore'
if (!(Test-Path -LiteralPath $key)) {
    Run "$JavaHome\bin\keytool.exe" @('-genkeypair','-keystore',$key,'-storepass','android','-keypass','android',
        '-alias','androiddebugkey','-dname','CN=Android Debug,O=Emberkeep,C=US','-keyalg','RSA','-validity','10000')
}
Run "$tools\apksigner.bat" @('sign','--ks',$key,'--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,$aligned)
Run "$tools\apksigner.bat" @('verify','--verbose',$apk)
Run "$tools\zipalign.exe" @('-c','4',$apk)
Run "$tools\aapt2.exe" @('dump','badging',$apk)
Copy-Item -LiteralPath "$assets\index.html" -Destination "$OutputDirectory\Emberkeep.html" -Force
Get-FileHash -LiteralPath $apk,"$OutputDirectory\Emberkeep.html" -Algorithm SHA256
