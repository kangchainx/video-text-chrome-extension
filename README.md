<div align="center">

<img src="public/logos/promo-small-440x280.png" width="100%" alt="Video Text Chrome Extension Logo" />

**Your Private, Unlimited, Local Transcription Studio.**

An advanced Chrome Side Panel tool that turns videos into text using local AI power. Secure, free, and unlimited.

[![GitHub Stars](https://img.shields.io/github/stars/kangchainx/video-text-chrome-extension?style=flat-square&logo=github)](https://github.com/kangchainx/video-text-chrome-extension/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/kangchainx/video-text-chrome-extension?style=flat-square&logo=github)](https://github.com/kangchainx/video-text-chrome-extension/network/members)
[![License](https://img.shields.io/github/license/kangchainx/video-text-chrome-extension?style=flat-square)](https://github.com/kangchainx/video-text-chrome-extension/blob/main/LICENSE)
[![Issues](https://img.shields.io/github/issues/kangchainx/video-text-chrome-extension?style=flat-square)](https://github.com/kangchainx/video-text-chrome-extension/issues)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

## Why This Extension?

Unlike cloud-based services with time limits and privacy risks, this extension runs entirely on your machine.

-   🔒 **Privacy First**: All data stays on your `localhost`. No audio is ever uploaded to the cloud.
-   ♾️ **Unlimited**: No monthly limits, no file size limits. Transcribe 5-hour lectures or podcasts for free.
-   🎬 **Login Support**: download & transcribe high-quality videos (1080p+) from sites like Bilibili by reusing your browser cookies.
-   🚀 **Powerful Native Backend**: Uses a local Python service (FastAPI + yt-dlp + faster-whisper) to bypass browser limitations.

---

## Installation (For Users)

### Option A: One-Click Installer (macOS & Windows)
*(Recommended for most users)*

**macOS**:
Copy and paste this command into your Terminal:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/kangchainx/video-text-chrome-extension/main/native-host/install_mac.sh)"
```
(Or download `install_mac.sh` from [Latest Release](https://github.com/kangchainx/video-text-chrome-extension/releases/latest) and run it)

**Windows**:
1. Download `install_win.ps1` from the [Latest Release](https://github.com/kangchainx/video-text-chrome-extension/releases/latest).
2. Right-click the file and select **"Run with PowerShell"**.

These scripts will automatically:
1. Download the latest Native Host release.
2. Install it to your user directory.
3. Register the Native Host manifest with Chrome/Edge.

### Option B: Manual Setup (For Developers)

If you prefer to run the Python service from source or are developing the extension.

#### 1. Extension Setup
```bash
npm install
npm run dev
# Load 'dist' directory in chrome://extensions
```

#### 2. Local Service Setup

**Pre-requisites**: Python 3.10+, Node.js (for YouTube verification)

If you want to build the packaged Native Host locally and install that package on your own machine for testing, use the release-style flow below:

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate

# 2. Install full packaging dependencies
pip install -r requirements.txt pyinstaller

# 3. Ensure the latest yt-dlp is bundled for the local package
pip install -U yt-dlp

# 4. Build the macOS Native Host package locally
./native-host/build-macos-zip.sh <YOUR_EXTENSION_ID> <VERSION>
# Example: ./native-host/build-macos-zip.sh abcdefghijklmnopabcdefghijklmnop 1.0.6

# 5. Install the locally built package
cd native-host
chmod +x install_mac.sh
./install_mac.sh
```

Notes:
- `build-macos-zip.sh` outputs `native-host/video-text-host-macos.zip`.
- `build-macos-zip.sh` also upgrades `yt-dlp` before packaging, matching the release workflow.
- `install_mac.sh` will use that local ZIP first if it exists in the current directory, so it will not download from GitHub.
- After installation, reload the extension in `chrome://extensions` before retesting.

If you prefer to run the Python service directly from source during development, use the source-mode flow below:

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements-mini.txt

# 3. Setup Native Host (macOS)
chmod +x native-host/install-macos.sh
./native-host/install-macos.sh <YOUR_EXTENSION_ID>
# You can find the ID in chrome://extensions
```

#### 3. Run Service
For development, you can run the service manually to see logs:
```bash
python mini_transcriber.py
```
*Port*: `8001` (Default)

---

## Usage

1.  **Open Video**: Navigate to a YouTube or Bilibili video.
2.  **Open Panel**: Click the extension icon to open the Side Panel.
3.  **Transcribe**: Click **"Create Task"**.
4.  **Wait & Download**: The task runs in the background. Once done, click **"Download TXT"**.

---

## 📝 Version History

### v1.0.7 (2026-03-24)

**🎧 Long Audio Transcription**
- Split long audio into smaller chunks before Whisper transcription to avoid memory spikes and failures on videos around 2 hours long.
- Improve transcription error classification so transcription-stage failures are no longer reported as generic download failures.

**📦 Local Packaging Parity**
- Align local macOS Native Host packaging with the release workflow by bundling `ffmpeg` in locally built packages.
- Make local packaging explicitly upgrade and bundle the latest `yt-dlp` at build time, matching CI behavior.

**🔄 Update Experience**
- Improve the update checker to compare both Native Host `service_version` and bundled `yt-dlp` version.
- Update the sidepanel update badge to show separate service and `yt-dlp` version changes with clearer reasons to upgrade.

**📚 Documentation**
- Expand the developer setup docs for locally building and installing the packaged macOS Native Host.

**Component Versions:**
- yt-dlp: 2026.03.17

### v1.0.6 (2026-02-05)

**🔄 yt-dlp Release Refresh**
- Publish a new tag to trigger CI rebuild so the native host bundles the latest `yt-dlp`.
- Keep release notes explicit with `yt-dlp: YYYY.MM.DD` so the sidepanel update checker can detect updates correctly.

**🧭 Operations**
- Add a dedicated SOP for handling `yt-dlp` version lag, including changelog update, branch/PR flow, and tag release steps.
- Clarify post-release action: reinstall/upgrade local native service, then retry failed tasks.

### v1.0.5 (2026-01-31)

**🚀 Background Task & Notification**
- **Move task sync to background**: Task updates and badge counts are handled by the service worker to keep the side panel lightweight.
- **Reliable notifications**: Completion/error notifications are sent from background, independent of the panel lifecycle.

**🧩 MV3 Stability**
- **Auto-restore SSE**: Persist SSE credentials and restart streaming after MV3 worker restarts.

**📦 Release Alignment**
- **Windows packaging parity**: Align installer manifest path and PyInstaller resource collection with macOS build behavior.

**🔧 Windows Installer Improvements**
- **Fixed manifest.json formatting**: Corrected JSON path escaping (single `\` to double `\\`) and removed unwanted newlines in `allowed_origins` field.
- **Improved uninstall script**: Replaced PowerShell-based uninstaller with native batch script - no longer requires administrator privileges, more reliable and easier to maintain.

**📚 Documentation**
- **Local service paths reference**: Added comprehensive documentation of installation paths, manifest locations, and registry keys for both macOS and Windows in troubleshooting section.

**🐛 Bug Fixes**
- **Cancel timestamp**: Avoid updating `updatedAt` when canceling transitions to canceled.

### v1.0.4 (2026-01-30)

**🚀 Enhanced YouTube Compatibility**
- **Bundled Node.js Runtime**: Package Node.js v20.11.1 with macOS (ARM64) and Windows (x64) releases to enable advanced YouTube signature decryption.
- **Auto-Detection**: Automatically detect bundled or system Node.js runtime with zero user configuration.
- **Smart Fallback**: When Node.js is unavailable, seamlessly fall back to mobile client mode for maximum compatibility.

**🐛 Bug Fixes**
- Fix Windows native messaging entry point to correctly launch the host wrapper instead of the transcription service.

### v1.0.3 (2026-01-24)

**⚡️ Automation & Build System**
- **Automated Chrome Extension Build**: Added GitHub Actions workflow to auto-build and release the Chrome Extension zip.
- **Auto-Update yt-dlp**: Release builds now automatically fetch and package the latest version of `yt-dlp`, ensuring users always get the newest downloader.
- **Smart Release Notes**: Release notes are now automatically extracted from README.md and enriched with component version info.

### v1.0.2 (2026-01-23)
- Fix Windows installer download link
- General stability improvements

### v1.0.1 (2026-01-15)

**✨ New Features**
- Add manual native host recheck functionality
- Automatically disable "Add Task" button when native host not installed
- Add "Recheck" button in installation guide panel

**🚀 Performance Improvements**
- Remove 10-second startup overlay delay, close immediately when service is ready
- Optimize native host detection flow with early check on component mount
- Fix overlay state control logic to properly handle all service states

**💡 UX Enhancements**
- Optimize onboarding tour timing, only start after service ready and overlay closed
- Remove click interaction from service status badge, simplify to display-only component
- Clearer installation status prompts and error feedback

**🐛 Bug Fixes**
- Fix service connection issue on first launch
- Fix overlay control logic for 'starting' state
- Clean up debug code to reduce console output

### v1.0.0 (2026-01-XX)
- Initial release
- Basic video-to-text transcription
- Support for YouTube and Bilibili
- Local AI transcription (Faster-Whisper)

---

## Architecture

This project uses a hybrid architecture to combine the convenience of a browser extension with the power of native code.

-   **Frontend**: React 19 + TypeScript + Vite (Chrome Side Panel)
-   **Backend**: Python (FastAPI) + SQLite
-   **Core Engines**:
    -   `yt-dlp`: For robust video/audio downloading.
    -   `faster-whisper`: For high-performance local AI transcription.
-   **Bridge**: Chrome Native Messaging (connects extension to local Python process).

## Troubleshooting

### Common Issues

#### "Native host has exited" / Extension Can't Connect to Service

**Symptom**: Extension shows connection error or "Native host not installed" even after installation.

**Possible Causes**:

1. **Local Service Paths (macOS / Windows)**

   If you need to verify where the native host and Python service were installed:

   **macOS**
   - Install dir: `~/Library/Application Support/VideoTextHost`
   - Python service (packaged): `~/Library/Application Support/VideoTextHost/video-text-transcriber/video-text-transcriber`
   - Native host launcher: `~/Library/Application Support/VideoTextHost/host-macos.sh`
   - Source manifest: `~/Library/Application Support/VideoTextHost/manifest.json`
   - Chrome manifest: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json`
   - Edge manifest: `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.video_text.transcriber.json`

   **Windows**
   - Native Messaging manifest is stored in the registry, not a JSON file under Chrome's profile.
   - Install dir: `%APPDATA%\VideoTextHost`
   - Python service (packaged): `%APPDATA%\VideoTextHost\video-text-transcriber.exe`
   - Native host launcher: `%APPDATA%\VideoTextHost\host-win.bat`
   - Source manifest: `%APPDATA%\VideoTextHost\manifest.json`
   - Chrome registry key: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.video_text.transcriber`
   - Edge registry key: `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.video_text.transcriber`

2. **Extension ID Mismatch** (Most Common)

   There are **two** manifest.json files involved:
   - **Source file**: `~/Library/Application Support/VideoTextHost/manifest.json` (macOS)
     - Generated by the installer with the correct extension ID
     - Used as a template but NOT read by Chrome

   - **Chrome's active file**: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json`
     - This is what Chrome actually reads
     - Copied from the source file during installation

   **The Problem**: If you updated the extension or reinstalled with a different ID, the source file gets updated but Chrome's file might still have the old ID.

   **Solution**:
   ```bash
   # macOS: Verify extension IDs match
   cat ~/Library/Application\ Support/VideoTextHost/manifest.json
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json

   # If they differ, copy the correct one:
   cp ~/Library/Application\ Support/VideoTextHost/manifest.json \
      ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json

   # Then reload your extension in chrome://extensions
   ```

2. **Script Not Executable**
   ```bash
   chmod +x ~/Library/Application\ Support/VideoTextHost/host-macos.sh
   ```

3. **Incorrect Path in Manifest**

   Verify the `path` field in Chrome's manifest points to the correct location:
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json
   ```

#### Permission Denied

Run `chmod +x` on all scripts in `native-host/` directory.

#### Download Error (403 / 401)

-   **YouTube**: Usually works without cookies using mobile client spoofing.
-   **Bilibili 1080p**: Requires cookies. The extension needs permission to read cookies for `.bilibili.com`.
-   Check `temp/service.log` for detailed error messages.

#### First Transcription is Slow / Model Not Found

-   First run downloads ~150MB Whisper model to cache (`~/.cache/whisper` or `~/.cache/faster-whisper`)
-   Subsequent transcriptions will be much faster
-   Set `WHISPER_MODEL_DIR` environment variable to use custom cache location

## Roadmap

- [ ] **Cloud Transcription Service**: Optional server-side processing for faster transcription and higher model quality (may involve fees).
- [ ] **Batch Processing**: Support for transcribing multiple videos at once.
- [ ] **Custom Model Selection**: Allow users to choose between different Whisper model sizes (base/small/medium).

## Privacy & Data Protection

🔒 **Your privacy matters**. This extension:
- ✅ Processes all data **locally** on your machine
- ✅ **Never uploads** video content or transcripts to any cloud server
- ✅ Only uses cookies to access high-quality videos you're already authorized to view
- ✅ Does not collect analytics, tracking data, or personal information

For full details, see our [Privacy Policy](PRIVACY.md).

---

## Contributing

Pull requests are welcome! Please make sure to update tests as appropriate.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
