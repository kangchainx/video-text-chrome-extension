; VideoTextHost Installer Script for NSIS
; This script is used by GitHub Actions to build VideoTextInstaller.exe

!include "MUI2.nsh"
!include "FileFunc.nsh"

; --- Basic Information ---
Name "VideoText Host"
OutFile "VideoTextInstaller.exe"
InstallDir "$APPDATA\VideoTextHost"
RequestExecutionLevel user ; No admin required since we install to AppData

; --- Interface Settings ---
!define MUI_ABORTWARNING
; !define MUI_ICON "setup_icon.ico" ; We'll use a placeholder or skip if not found

; --- Pages ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; --- Languages ---
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "MainSection" SEC01
  DetailPrint "Preparing installation..."

  ; 1. Check for existing installation and Backup Data
  IfFileExists "$INSTDIR\temp\*.*" 0 +7
    DetailPrint "Existing data found. Backing up tasks and models..."
    CreateDirectory "$INSTDIR_BACKUP"
    ; Backup temp dir recursively
    CopyFiles /SILENT "$INSTDIR\temp\*.*" "$INSTDIR_BACKUP"
    DetailPrint "Backup completed."

  ; 2. Stop running process
  DetailPrint "Stopping existing service..."
  nsExec::Exec 'taskkill /F /IM video-text-transcriber.exe /T'
  Sleep 1000

  ; 3. Clean and Install Files
  DetailPrint "Installing new files..."
  SetOutPath "$INSTDIR"
  ; These files are expected to be in the staging directory when makensis is called
  File /r "staging\*.*"

  ; 4. Restore Data from Backup
  IfFileExists "$INSTDIR_BACKUP\*.*" 0 +5
    DetailPrint "Restoring your data..."
    CreateDirectory "$INSTDIR\temp"
    CopyFiles /SILENT "$INSTDIR_BACKUP\*.*" "$INSTDIR\temp"
    RMDir /r "$INSTDIR_BACKUP"
    DetailPrint "Data restored successfully."

  ; 5. Register Native Messaging Host (Registry)
  DetailPrint "Registering with browsers..."
  
  ; Get Extension ID from file
  FileOpen $0 "$INSTDIR\extension-id.txt" r
  FileRead $0 $1
  FileClose $0
  StrCpy $2 $1 ; $2 now contains Extension ID

  ; Write manifest.json with absolute path
  FileOpen $0 "$INSTDIR\manifest.json" w
  FileWrite $0 '{\r\n'
  FileWrite $0 '  "name": "com.video_text.transcriber",\r\n'
  FileWrite $0 '  "description": "VideoText Transcriber Native Host",\r\n'
  FileWrite $0 '  "path": "host-win.bat",\r\n'
  FileWrite $0 '  "type": "stdio",\r\n'
  FileWrite $0 '  "allowed_origins": ["chrome-extension://$2/"]\r\n'
  FileWrite $0 '}'
  FileClose $0

  ; Create host-win.bat
  FileOpen $0 "$INSTDIR\host-win.bat" w
  FileWrite $0 '@echo off\r\n'
  FileWrite $0 '"%~dp0video-text-transcriber.exe" %*\r\n'
  FileClose $0

  ; Registry Keys for Chrome
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\com.video_text.transcriber" "" "$INSTDIR\manifest.json"
  ; Registry Keys for Edge
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.video_text.transcriber" "" "$INSTDIR\manifest.json"

  DetailPrint "Registration complete."

SectionEnd

Section "Uninstall"
  ; Stop process
  nsExec::Exec 'taskkill /F /IM video-text-transcriber.exe /T'
  
  ; Remove Registry Keys
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.video_text.transcriber"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.video_text.transcriber"

  ; Remove Files
  RMDir /r "$INSTDIR"
SectionEnd
