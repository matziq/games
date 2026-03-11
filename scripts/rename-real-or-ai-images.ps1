param(
    [string]$GameDir = (Join-Path $PSScriptRoot "..\real_or_ai")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Renames image files in the ai/ and real/ folders to sequential format:
    ai_0001.jpg, ai_0002.jpg, ... and real_0001.jpg, real_0002.jpg, ...
    Fills gaps in numbering and appends new (non-matching) files after the last number.
    Uses a two-phase rename (temp names first) to avoid overwriting.
#>

function Rename-SequentialImages {
    param(
        [string]$FolderPath,
        [string]$Prefix
    )

    if (-not (Test-Path $FolderPath)) {
        Write-Host "  Folder not found: $FolderPath" -ForegroundColor Yellow
        return
    }

    $imageExts = @('.jpg', '.jpeg', '.png', '.gif', '.webp')
    $allFiles = Get-ChildItem -LiteralPath $FolderPath -File |
        Where-Object { $imageExts -contains $_.Extension.ToLower() }

    if ($allFiles.Count -eq 0) {
        Write-Host "  No image files in $FolderPath" -ForegroundColor Yellow
        return
    }

    $rx = [regex]::new(
        "^" + [regex]::Escape($Prefix) + "_(\d+)\.(jpg|jpeg|png|gif|webp)$",
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $matchingFiles = [System.Collections.ArrayList]::new()
    $nonMatchingFiles = [System.Collections.ArrayList]::new()

    foreach ($file in $allFiles) {
        $m = $rx.Match($file.Name)
        if ($m.Success) {
            [void]$matchingFiles.Add([PSCustomObject]@{
                File   = $file
                Number = [int]$m.Groups[1].Value
            })
        } else {
            [void]$nonMatchingFiles.Add($file)
        }
    }

    # Sort matching by number, non-matching by name
    $matchingFiles = $matchingFiles | Sort-Object Number
    $nonMatchingFiles = $nonMatchingFiles | Sort-Object Name

    # Build ordered list: existing numbered files first, then new files
    $orderedFiles = @()
    $orderedFiles += $matchingFiles | ForEach-Object { $_.File }
    $orderedFiles += $nonMatchingFiles

    # Check if any rename is actually needed
    $needsRename = $false
    for ($i = 0; $i -lt $orderedFiles.Count; $i++) {
        $expectedName = "{0}_{1:D4}{2}" -f $Prefix, ($i + 1), $orderedFiles[$i].Extension.ToLower()
        if ($orderedFiles[$i].Name -cne $expectedName) {
            $needsRename = $true
            break
        }
    }

    if (-not $needsRename) {
        Write-Host "  $Prefix/: $($orderedFiles.Count) files already sequential — no changes." -ForegroundColor Gray
        return
    }

    # Phase 1: rename all to unique temp names to avoid collisions
    $tempMappings = @()
    for ($i = 0; $i -lt $orderedFiles.Count; $i++) {
        $guid = [System.Guid]::NewGuid().ToString('N').Substring(0, 12)
        $ext = $orderedFiles[$i].Extension.ToLower()
        $tempName = "__temp_${guid}${ext}"
        $tempPath = Join-Path $FolderPath $tempName
        Rename-Item -LiteralPath $orderedFiles[$i].FullName -NewName $tempName
        $tempMappings += [PSCustomObject]@{
            TempPath  = $tempPath
            Extension = $orderedFiles[$i].Extension.ToLower()
            Index     = $i
        }
    }

    # Phase 2: rename from temp to final sequential names
    $renamed = 0
    foreach ($entry in $tempMappings) {
        $finalName = "{0}_{1:D4}{2}" -f $Prefix, ($entry.Index + 1), $entry.Extension
        Rename-Item -LiteralPath $entry.TempPath -NewName $finalName
        $renamed++
    }

    Write-Host "  $Prefix/: $renamed files renamed sequentially (0001..$($renamed.ToString('D4')))." -ForegroundColor Green
}

Write-Host "Renaming images to sequential format..." -ForegroundColor Cyan
Rename-SequentialImages -FolderPath (Join-Path $GameDir 'ai')   -Prefix 'ai'
Rename-SequentialImages -FolderPath (Join-Path $GameDir 'real') -Prefix 'real'
Write-Host "Done." -ForegroundColor Cyan
