@echo off
setlocal EnableExtensions

echo === VideoText Native Host Uninstaller (Windows) ===
echo.

set "AppName=VideoTextHost"
set "HostName=com.video_text.transcriber"
set "InstallDir=%APPDATA%\%AppName%"

call :KillProcess "video-text-transcriber.exe"
call :KillProcess "native-host.exe"

call :DelReg "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HostName%" "Google Chrome"
call :DelReg "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HostName%" "Microsoft Edge"

echo 3. Removing installation directory...
if exist "%InstallDir%" goto :DelDir
echo [INFO] Directory not found: %InstallDir%
goto :AfterDir
:DelDir
rmdir /s /q "%InstallDir%"
if exist "%InstallDir%" echo [WARN] Failed to remove: %InstallDir%
if not exist "%InstallDir%" echo [OK] Removed: %InstallDir%
:AfterDir

echo.
echo ==========================================
echo    Uninstall Complete
echo ==========================================
pause
exit /b 0

:KillProcess
set "PName=%~1"
echo 1. Stopping process %PName% ...
taskkill /F /IM "%PName%" >nul 2>&1
if errorlevel 1 echo [INFO] %PName% not running or access denied.
if not errorlevel 1 echo [OK] %PName% stopped.
exit /b 0

:DelReg
set "Key=%~1"
set "Label=%~2"
echo 2. Removing registry key for %Label% ...
reg query "%Key%" >nul 2>&1
if errorlevel 1 goto :RegNotFound
reg delete "%Key%" /f >nul 2>&1
reg query "%Key%" >nul 2>&1
if errorlevel 1 echo [OK] Unregistered from %Label%.
if not errorlevel 1 echo [WARN] Failed to remove registry key in %Label% - try running as Administrator.
goto :RegDone
:RegNotFound
echo [INFO] Not registered in %Label%.
:RegDone
exit /b 0
