param(
    [int]$MaxPerFolder = 100,
    [string]$GameDir = (Join-Path $PSScriptRoot "..\real_or_ai")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Do not renumber files here. real_0023 must stay paired with ai_0023.
# rename-real-or-ai-images.ps1 fills gaps and would break that match.

$manifestPath = Join-Path $GameDir 'image_manifest.js'

function Get-ImageList([string]$folderName, [string]$prefix) {
    $folderPath = Join-Path $GameDir $folderName
    if (-not (Test-Path $folderPath)) {
        return , @{}
    }

    # Expected filenames (case-insensitive):
    #   ai_1234.jpg / ai_ 1234.jpg / ai_1234.png
    #   real_1234.jpg / real_ 1234.jpg / real_1234.png
    $rx = [regex]::new("^" + [regex]::Escape($prefix) + "_\s*(\d+)\.(jpg|jpeg|png|gif|webp)$", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    $items = @(Get-ChildItem -LiteralPath $folderPath -File |
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
        Sort-Object Id, Name)

    # Hashtable, not [ordered]: integer keys are indexes on OrderedDictionary.
    $byId = @{}
    foreach ($item in $items) {
        if (-not $byId.ContainsKey($item.Id)) {
            $byId[$item.Id] = $item
        }
    }
    return , $byId
}

$aiById = Get-ImageList 'ai' 'ai'
$realById = Get-ImageList 'real' 'real'
$pairIds = @($aiById.Keys | Where-Object { $realById.ContainsKey($_) } | Sort-Object)
# MaxPerFolder caps complete pairs. 0 means every matched number.
if ($MaxPerFolder -gt 0 -and $pairIds.Count -gt $MaxPerFolder) {
    $pairIds = @($pairIds | Select-Object -First $MaxPerFolder)
}

$ai = @($pairIds | ForEach-Object { "ai/$($aiById[$_].Name)" })
$real = @($pairIds | ForEach-Object { "real/$($realById[$_].Name)" })

# -InputObject keeps a 0- or 1-item list as a JSON array.
$aiJson = ConvertTo-Json -InputObject @($ai) -Depth 2
$realJson = ConvertTo-Json -InputObject @($real) -Depth 2

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
