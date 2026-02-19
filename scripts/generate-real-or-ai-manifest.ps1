param(
    [int]$MaxPerFolder = 100,
    [string]$GameDir = (Join-Path $PSScriptRoot "..\real_or_ai")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$manifestPath = Join-Path $GameDir 'image_manifest.js'

function Get-ImageList([string]$folderName, [string]$prefix) {
    $folderPath = Join-Path $GameDir $folderName
    if (-not (Test-Path $folderPath)) {
        return @()
    }

    # Expected filenames (case-insensitive):
    #   ai_1234.jpg / ai_1234.png
    #   real_1234.jpg / real_1234.png
    $rx = [regex]::new("^" + [regex]::Escape($prefix) + "_(\d+)\.(jpg|jpeg|png|gif|webp)$", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    $items = Get-ChildItem -LiteralPath $folderPath -File |
    ForEach-Object {
        $m = $rx.Match($_.Name)
        if ($m.Success) {
            [PSCustomObject]@{
                Name = $_.Name
                Id   = [int]$m.Groups[1].Value
            }
        }
    } |
    Where-Object { $_ -ne $null } |
    Sort-Object Id, Name |
    Select-Object -First $MaxPerFolder

    return $items | ForEach-Object { "$folderName/$($_.Name)" }
}

$ai = Get-ImageList 'ai' 'ai'
$real = Get-ImageList 'real' 'real'

$aiJson = $ai | ConvertTo-Json -Depth 2
$realJson = $real | ConvertTo-Json -Depth 2

$content = @(
    "// Auto-generated image manifest for real_or_ai.",
    "// This file is intentionally plain JS so it can be loaded via <script> from file://.",
    "// Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "",
    "window.__REAL_OR_AI_MANIFEST__ = {",
    "  ai: $aiJson,",
    "  real: $realJson",
    "};",
    ""
) -join "`n"

Set-Content -LiteralPath $manifestPath -Value $content -Encoding UTF8
Write-Host "Wrote manifest: $manifestPath" -ForegroundColor Green
Write-Host "AI:   $($ai.Count)" -ForegroundColor Gray
Write-Host "Real: $($real.Count)" -ForegroundColor Gray
