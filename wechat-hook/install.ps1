# MaoMaoXia WeChat-Hook Installer (PowerShell)
# Run: PowerShell -ExecutionPolicy Bypass -File install.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MaoMaoXia WeChat-Hook Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$wechatPaths = @(
    "C:\Program Files\Tencent\WeChat",
    "C:\Program Files\Tencent\Weixin",
    "C:\Program Files (x86)\Tencent\WeChat",
    "$env:LOCALAPPDATA\Programs\WeChat"
)

$found = $null
foreach ($p in $wechatPaths) {
    if (Test-Path "$p\WeChat.exe") {
        $found = $p
        break
    }
}

if (-not $found) {
    Write-Host "[ERROR] WeChat not found!" -ForegroundColor Red
    Write-Host "Tried: $($wechatPaths -join ', ')"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Found WeChat: $found" -ForegroundColor Green

$dllPath = Join-Path $PSScriptRoot "version.dll"
if (-not (Test-Path $dllPath)) {
    Write-Host "[ERROR] version.dll not found in: $PSScriptRoot" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Copying version.dll..." -ForegroundColor Yellow
try {
    Copy-Item -Path $dllPath -Destination "$found\version.dll" -Force
    Write-Host "DLL copied OK" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Copy failed: $_" -ForegroundColor Red
    Write-Host "Try: Right-click PowerShell -> Run as Administrator" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Block WeChat auto-update
$noUpdate = "$found\NoUpdate"
if (-not (Test-Path $noUpdate)) {
    New-Item -ItemType Directory -Path $noUpdate -Force | Out-Null
    Write-Host "Auto-update blocked" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now:"
Write-Host "  1. Start WeChat" -ForegroundColor Yellow
Write-Host "  2. Open: http://127.0.0.1:30001/QueryDB/status" -ForegroundColor Yellow
Write-Host "  3. Expected: {""IsLogin"":1}" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
