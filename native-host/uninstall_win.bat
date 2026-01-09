@echo off
setlocal

echo === VideoText Native Host Uninstaller (Windows) ===
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Run the PowerShell uninstallation logic
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    $ErrorActionPreference = 'Stop';
    $AppName = 'VideoTextHost';
    $HostName = 'com.video_text.transcriber';
    $InstallDir = \"$env:LOCALAPPDATA\$AppName\";

    function Unregister-NativeHost {
        param ([string]$RegistryPath, [string]$Name);
        $KeyPath = \"HKCU:\$RegistryPath\NativeMessagingHosts\$HostName\";
        if (Test-Path $KeyPath) {
            Remove-Item -Path $KeyPath -Force;
            Write-Host \"✅ Unregistered from $Name\" -ForegroundColor Green;
        } else {
            Write-Host \"⚠️  Not registered in $Name (or already removed)\" -ForegroundColor Yellow;
        }
    };

    Write-Host '1. Stopping processes...' -ForegroundColor Cyan;
    Stop-Process -Name 'video-text-transcriber' -ErrorAction SilentlyContinue;
    Stop-Process -Name 'native-host' -ErrorAction SilentlyContinue;

    Write-Host '2. Removing registry keys...' -ForegroundColor Cyan;
    Unregister-NativeHost -RegistryPath 'Software\Google\Chrome' -Name 'Google Chrome';
    Unregister-NativeHost -RegistryPath 'Software\Microsoft\Edge' -Name 'Microsoft Edge';

    Write-Host '3. Removing installation directory...' -ForegroundColor Cyan;
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir;
        Write-Host \"✅ Removed: $InstallDir\" -ForegroundColor Green;
    } else {
        Write-Host \"⚠️  Directory not found: $InstallDir\" -ForegroundColor Yellow;
    };

    Write-Host '';
    Write-Host '==========================================' -ForegroundColor Green;
    Write-Host '   Uninstall Complete!   ' -ForegroundColor Green;
    Write-Host '==========================================' -ForegroundColor Green;
    Write-Host 'Press any key to exit...' ;
    [void][System.Console]::ReadKey();
}"
