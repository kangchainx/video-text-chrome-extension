> **Note**: This file serves as the primary context source for AI agents to understand the project's current state, architectural decisions, and critical fixes.

## Latest Updates (2026-01-07)

### ✅ Feature: Bundled FFmpeg & Cross-Platform Support
- **Problem**: Users without FFmpeg (e.g. via Homebrew) failed to transcribe YouTube videos which require transcoding.
- **Solution**:
  - Updated **macOS & Windows** release workflows to automatically download and bundle a static FFmpeg binary.
  - Updated `mini_transcriber.py` with intelligent detection logic: `Env` -> `PATH` -> `Common Paths` -> `Bundled Binary`.
- **Result**: "Out-of-the-box" support for all users without manual dependency installation.

### 🛡 Feature: Task Validation
- **Problem**: Users could accidentally create tasks on non-video pages (e.g. YouTube Homepage), leading to confusing errors.
- **Solution**: Added `isVideoPage` validation in `App.tsx` to strictly check for supported video URL patterns (e.g., `/watch?v=`, `/video/`).
- **I18n**: Added localized error messages for invalid page actions.

### 🐛 Fixes & Configuration
- **UI Fix**: Resolved `Megaphone` icon import error in `src/sidepanel/App.tsx`.
- **Release Process**: Verified requirement to update `extension-id.txt` in `release-macos.yml` with the actual Chrome Web Store ID. This ensures the Native Host allows connections from the production extension structure (`allowed_origins`).

### ✅ Feature: macOS One-Click Installer & Gatekeeper Bypass

**Problem**: The macOS Native Host service (packaged with PyInstaller) took ~6 minutes to start on the first run.
**Root Cause**: macOS Gatekeeper deeply scans every single `.so` and `.dylib` file in the PyInstaller bundle (hundreds of files) because they lack a valid Apple Developer ID signature.
**Solution**:
1.  **Architecture Change**: Switched from `.pkg` installer to a **ZIP archive** + **Installation Script** approach.
2.  **Gatekeeper Bypass**: The `install_mac.sh` script automatically downloads the ZIP, unzips it, and critically runs `xattr -dr com.apple.quarantine` on the installation directory. This removes the security flags locally, allowing the application to start instantly (<1s) without scanning.
3.  **User Experience**: Users only need to run a single `curl | bash` command.

**Artifacts**:
- `native-host/build-macos-zip.sh`: Builds the signed-free application zip.
- `native-host/install_mac.sh`: Handles download, installation, quarantine removal, and Chrome registration.

---

## Critical Bug Fixes

### Fix #4: Broken Pipe Error
**Problem**: Tasks failing with `[Errno 32] Broken pipe`.
**Solution**: Wrapped `sys.stderr` writes in `_log()` with try-except blocks.

### Fix #3: WhisperModel UnboundLocalError
**Problem**: `UnboundLocalError` when loading Whisper model due to Python scope issues.
**Solution**: Fixed `_get_whisper_model` function signature and global variable declarations.

### Fix #1: Slow Startup (Preloading)
**Problem**: Service took ~50s to become responsive.
**Solution**: Removed aggressive model preloading from startup. Now modules are lazy-loaded, and the model weights are loaded only upon the first user request (Task status shows "Loading model...").

---

## Project Structure Overview

### Frontend (Chrome Extension)
- **Framework**: React + Vite + TypeScript
- **Entry Points**:
  - `src/sidepanel`: Main UI (Task list, status)
  - `src/background`: Service worker (Native Messaging bridge)
  - `src/content`: Page interaction (Video extraction)
- **Styling**: TailwindCSS
- **I18n**: Support for English & Chinese

### Backend (Native Host)
- **Core**: Python (packaged via PyInstaller)
- **Dependencies**: `faster-whisper`, `yt-dlp`, `opencc`
- **Communication**: Standard I/O (Native Messaging protocol)
- **Logging**: `sys.stderr` (Debug) + File logs in `temp/service.log`
- **Database**: SQLite (Task history)

## Installation Guide (Internal)

#### macOS
**Build**:
```bash
./native-host/build-macos-zip.sh <extension_id> <version>
```

**Install** (for users):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/kangchainx/video-text-chrome-extension/main/native-host/install_mac.sh)"
```

## Known Issues / TODO
- Windows support is currently pending (requires `install_win.ps1`).
- Long-term: Consider Apple Developer ID signing if distributing outside of GitHub.
