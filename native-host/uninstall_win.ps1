$ErrorActionPreference = "Stop"

$AppName = "VideoTextHost"
$HostName = "com.video_text.transcriber"
$InstallDir = "$env:LOCALAPPDATA\$AppName"

Write-Host "=== VideoText Native Host Uninstaller (Windows) ===" -ForegroundColor Cyan
Write-Host ""

# 1. Remove Directory
if (test-path $InstallDir) {
    Write-Host "Removing installation directory: $InstallDir"
    Remove-Item -Recurse -Force $InstallDir
    Write-Host "✅ Directory removed."
} else {
    Write-Host "Installation directory not found."
}

# 2. Remove Registry Keys
function Unregister-NativeHost {
    param (
        [string]$RegistryPath,
        [string]$Name
    )
    $KeyPath = "HKCU:\$RegistryPath\NativeMessagingHosts\$HostName"
    if (Test-Path $KeyPath) {
        Remove-Item -Path $KeyPath -Force
        Write-Host "✅ Unregistered from $Name"
    }
}

Unregister-NativeHost -RegistryPath "Software\Google\Chrome" -Name "Google Chrome"
Unregister-NativeHost -RegistryPath "Software\Microsoft\Edge" -Name "Microsoft Edge"

# 3. Kill processes if running
Stop-Process -Name "video-text-transcriber" -ErrorAction SilentlyContinue
Stop-Process -Name "native-host" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Uninstall Complete!   " -ForegroundColor Green
Write-Host "=========================================="
Write-Host "Press Enter to exit..."
Read-Host
