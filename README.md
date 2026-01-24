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

1. **Extension ID Mismatch** (Most Common)

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

