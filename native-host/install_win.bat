@echo off
setlocal

:: VideoText Native Host Installer (Windows)
:: Wrapper for PowerShell installation logic

echo === VideoText Native Host Installer (Windows) ===
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Run the PowerShell installation logic
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    $ErrorActionPreference = 'Stop';
    
    # Configuration
    $AppName = 'VideoTextHost';
    $HostName = 'com.video_text.transcriber';
    $InstallDir = \"$env:LOCALAPPDATA\$AppName\";
    $ZipName = 'video-text-host-win.zip';
    $DownloadUrl = 'https://github.com/kangchainx/video-text-chrome-extension/releases/latest/download/video-text-host-win.zip';

    if (Test-Path -Path $InstallDir) {
        Write-Host \"`n⚠️  Existing installation found at: $InstallDir\" -ForegroundColor Yellow;
        Write-Host \"This may contain cached models and temp files.\";
        $confirm = Read-Host \"Do you want to reinstall and clear previous data? [y/N]\";
        if ($confirm -notmatch '^[Yy]') {
            Write-Host \"Installation canceled by user.\";
            exit 1;
        }
        Write-Host \"Removing existing installation...\" -ForegroundColor Yellow;
        Remove-Item -Recurse -Force $InstallDir;
    }

    Write-Host \"`n[1/5] Preparing installation directory...\" -ForegroundColor Yellow;
    if (!(Test-Path -Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir | Out-Null;
    }
    Write-Host \"Target: $InstallDir\";

    Write-Host \"`n[2/5] Looking for installation files...\" -ForegroundColor Yellow;
    $ZipPath = \"$InstallDir\$ZipName\";
    
    # Check for local file in current directory first
    if (Test-Path -Path $ZipName) {
        Write-Host \"Found local file: $ZipName\";
        Copy-Item -Path $ZipName -Destination $ZipPath -Force;
    } else {
        Write-Host \"Downloading from GitHub...\";
        try {
            $wc = New-Object System.Net.WebClient;
            $wc.DownloadFile($DownloadUrl, $ZipPath);
            Write-Host \"✅ Download complete.\";
        } catch {
            Write-Host \"Error: Download failed. $($_.Exception.Message)\" -ForegroundColor Red;
            exit 1;
        }
    }

    Write-Host \"`n[3/5] Installing application...\" -ForegroundColor Yellow;
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $InstallDir -Force;
    Remove-Item -Path $ZipPath -Force;

    $IdPath = \"$InstallDir\extension-id.txt\";
    if (Test-Path -Path $IdPath) {
        $ExtensionId = (Get-Content -Path $IdPath -Raw).Trim();
    } else {
        Write-Host \"Error: extension-id.txt missing.\" -ForegroundColor Red;
        exit 1;
    }
    Write-Host \"Extension ID: $ExtensionId\";

    Write-Host \"`n[4/5] Registering with browser...\" -ForegroundColor Yellow;
    $ManifestPath = \"$InstallDir\manifest.json\";
    $HostExePath = \"$InstallDir\native-host.exe\";
    $EscapedHostPath = $HostExePath.Replace('\', '\\');

    $ManifestJson = @\"
{
  `\"name`\": `\"$HostName`\",
  `\"description`\": `\"VideoText Transcriber Native Host`\",
  `\"path`\": `\"$EscapedHostPath`\",
  `\"type`\": `\"stdio`\",
  `\"allowed_origins`\": [
    `\"chrome-extension://$ExtensionId/`\"
  ]
}
\"@;
    Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8;

    function Register-NativeHost {
        param ([string]$RegistryPath, [string]$Name);
        if (Test-Path \"HKCU:\$RegistryPath\") {
            $KeyPath = \"HKCU:\$RegistryPath\NativeMessagingHosts\$HostName\";
            if (!(Test-Path $KeyPath)) {
                New-Item -Path $KeyPath -Force | Out-Null;
            }
            Set-ItemProperty -Path $KeyPath -Name '(Default)' -Value $ManifestPath -Type String;
            Write-Host \"✅ Registered for $Name\";
        }
    };

    Register-NativeHost -RegistryPath 'Software\Google\Chrome' -Name 'Google Chrome';
    Register-NativeHost -RegistryPath 'Software\Microsoft\Edge' -Name 'Microsoft Edge';

    Stop-Process -Name 'video-text-transcriber' -ErrorAction SilentlyContinue;
    Stop-Process -Name 'native-host' -ErrorAction SilentlyContinue;

    Write-Host \"`n==========================================\" -ForegroundColor Green;
    Write-Host \"   Installation Successful!   \" -ForegroundColor Green;
    Write-Host \"==========================================\";
    Write-Host \"1. Installed to: $InstallDir\";
    Write-Host \"2. Registry keys updated.\";
    Write-Host \"3. Please reload the VideoText extension.\";
    Write-Host \"Press any key to exit...\";
    [void][System.Console]::ReadKey();
}"
