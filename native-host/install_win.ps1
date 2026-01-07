# install_win.ps1
# One-click installer for VideoText Chrome Extension Native Host on Windows.

$ErrorActionPreference = "Stop"

# Configuration
$AppName = "VideoTextHost"
$HostName = "com.video_text.transcriber"
$InstallDir = "$env:LOCALAPPDATA\$AppName"
$ZipName = "video-text-host-win.zip"
# TODO: Update with actual release URL
$DownloadUrl = "https://github.com/kangchainx/video-text-chrome-extension/releases/latest/download/video-text-host-win.zip"

Write-Host "=== VideoText Native Host Installer (Windows) ===" -ForegroundColor Cyan

# 1. Prepare Directory
Write-Host "`n[1/5] Preparing installation directory..." -ForegroundColor Yellow
if (!(Test-Path -Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}
Write-Host "Target: $InstallDir"

# 2. Download
Write-Host "`n[2/5] Looking for installation files..." -ForegroundColor Yellow
$ZipPath = "$InstallDir\$ZipName"
if (Test-Path -Path $ZipName) {
    Write-Host "Found local file: $ZipName"
    Copy-Item -Path $ZipName -Destination $ZipPath -Force
} else {
    Write-Host "Downloading from GitHub..."
    try {
        # Using .NET client for better compatibility than Invoke-WebRequest on some systems
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($DownloadUrl, $ZipPath)
        Write-Host "✅ Download complete."
    } catch {
        Write-Host "Error: Download failed. $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# 3. Extract
Write-Host "`n[3/5] Installing application..." -ForegroundColor Yellow
# Unzip
Expand-Archive -LiteralPath $ZipPath -DestinationPath $InstallDir -Force
Remove-Item -Path $ZipPath -Force

# Check for extension ID
$IdPath = "$InstallDir\extension-id.txt"
if (Test-Path -Path $IdPath) {
    $ExtensionId = Get-Content -Path $IdPath -Raw
    $ExtensionId = $ExtensionId.Trim()
} else {
    Write-Host "Error: extension-id.txt missing." -ForegroundColor Red
    exit 1
}
Write-Host "Extension ID: $ExtensionId"

# 4. Generate Manifest
Write-Host "`n[4/5] registering with browser..." -ForegroundColor Yellow

$ManifestPath = "$InstallDir\manifest.json"
# We assume the wrapper executable is named 'native-host.exe'
$HostExePath = "$InstallDir\native-host.exe"
# Escape backslashes for JSON
$EscapedHostPath = $HostExePath.Replace("\", "\\")

$ManifestJson = @"
{
  "name": "$HostName",
  "description": "VideoText Transcriber Native Host",
  "path": "$EscapedHostPath",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$ExtensionId/"
  ]
}
"@

Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8

# 5. Registry Registration
function Register-NativeHost {
    param (
        [string]$RegistryPath,
        [string]$Name
    )
    if (Test-Path "HKCU:\$RegistryPath") {
        $KeyPath = "HKCU:\$RegistryPath\NativeMessagingHosts\$HostName"
        if (!(Test-Path $KeyPath)) {
            New-Item -Path $KeyPath -Force | Out-Null
        }
        # Set Default value
        Set-ItemProperty -Path $KeyPath -Name "(Default)" -Value $ManifestPath -Type String
        Write-Host "✅ Registered for $Name"
    }
}

# Register for Chrome
Register-NativeHost -RegistryPath "Software\Google\Chrome" -Name "Google Chrome"
# Register for Edge
Register-NativeHost -RegistryPath "Software\Microsoft\Edge" -Name "Microsoft Edge"

# Kill running processes if any
Stop-Process -Name "video-text-transcriber" -ErrorAction SilentlyContinue
Stop-Process -Name "native-host" -ErrorAction SilentlyContinue

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "   Installation Successful!   " -ForegroundColor Green
Write-Host "=========================================="
Write-Host "1. Installed to: $InstallDir"
Write-Host "2. Registry keys updated."
Write-Host "3. Please reload the VideoText extension."
Write-Host "Press Enter to exit..."
Read-Host
