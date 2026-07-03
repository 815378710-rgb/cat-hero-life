# MaoMaoXia WeChat-Hook Installer (PowerShell)
# Run: Right-click -> Run with PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MaoMaoXia WeChat-Hook Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Search ALL common WeChat locations across ALL drives
$found = $null

# Manual paths to check first (most common)
$manualPaths = @(
    "C:\Program Files\Tencent\WeChat",
    "C:\Program Files\Tencent\Weixin",
    "C:\Program Files (x86)\Tencent\WeChat",
    "D:\Program Files\Tencent\WeChat",
    "D:\Program Files (x86)\Tencent\WeChat",
    "D:\WeChat",
    "E:\Program Files\Tencent\WeChat",
    "$env:LOCALAPPDATA\Programs\WeChat",
    "$env:LOCALAPPDATA\Tencent\WeChat"
)

foreach ($p in $manualPaths) {
    if (Test-Path "$p\WeChat.exe") {
        $found = $p
        break
    }
}

# If not found, search ALL drives
if (-not $found) {
    Write-Host "Searching all drives for WeChat.exe..." -ForegroundColor Yellow
    $drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -gt 0 } | Select-Object -ExpandProperty Root
    foreach ($drive in $drives) {
        $result = Get-ChildItem -Path $drive -Filter "WeChat.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($result) {
            $found = $result.DirectoryName
            break
        }
    }
}

# Still not found? Ask user
if (-not $found) {
    Write-Host "[ERROR] WeChat not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please enter your WeChat install folder manually." -ForegroundColor Yellow
    Write-Host "Example: D:\WeChat  or  D:\Program Files\Tencent\WeChat" -ForegroundColor Gray
    Write-Host ""
    $userPath = Read-Host "WeChat path"
    if ($userPath -and (Test-Path "$userPath\WeChat.exe")) {
        $found = $userPath
    } else {
        Write-Host "Still not found. Make sure WeChat is installed first." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

$version = (Get-Item "$found\WeChat.exe").VersionInfo.ProductVersion
Write-Host "Found WeChat: $found" -ForegroundColor Green
Write-Host "Version: $version" -ForegroundColor Green

# Check version
if ($version -notlike "4.1.10.*") {
    Write-Host "" 
    Write-Host "[WARNING] DLL is for WeChat 4.1.10.27, but you have $version" -ForegroundColor Yellow
    Write-Host "The DLL may not work with this version." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") { exit 0 }
}

# Copy DLL
$dllPath = Join-Path $PSScriptRoot "version.dll"
if (-not (Test-Path $dllPath)) {
    Write-Host "[ERROR] version.dll not found!" -ForegroundColor Red
    Write-Host "Make sure version.dll is in the same folder as this script." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Copying version.dll..." -ForegroundColor Yellow
try {
    Copy-Item -Path $dllPath -Destination "$found\version.dll" -Force
    Write-Host "DLL copied OK" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Copy failed. Run as Administrator!" -ForegroundColor Red
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
Write-Host "Now start WeChat and verify:" -ForegroundColor Yellow
Write-Host "  Open: http://127.0.0.1:30001/QueryDB/status" -ForegroundColor White
Write-Host "  Expected: {""IsLogin"":1}" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
