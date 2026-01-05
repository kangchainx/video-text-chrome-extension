# Video Text Chrome Extension

**[中文](README.zh-CN.md)**

> **Your Private, Unlimited, Local Transcription Studio.**
>
> An advanced Chrome Side Panel tool that turns videos into text using local AI power. Secure, free, and unlimited.

![License](https://img.shields.io/badge/license-ISC-blue.svg)

## Why This Extension?

Unlike cloud-based services with time limits and privacy risks, this extension runs entirely on your machine.

-   🔒 **Privacy First**: All data stays on your `localhost`. No audio is ever uploaded to the cloud.
-   ♾️ **Unlimited**: No monthly limits, no file size limits. Transcribe 5-hour lectures or podcasts for free.
-   🎬 **Login Support**: download & transcribe high-quality videos (1080p+) from sites like Bilibili by reusing your browser cookies.
-   🚀 **Powerful Native Backend**: Uses a local Python service (FastAPI + yt-dlp + faster-whisper) to bypass browser limitations.

---

## Installation (For Users)

### Option A: One-Click Installer (macOS)
*(Recommended for most users)*

1.  **Install the Chrome Extension**: Load the `dist` folder in `chrome://extensions` (Developer Mode).
2.  **Install the Local Service**:
    Download the installer and run it. This will set up the necessary Python environment and Native Messaging host for you.
    ```bash
    # (Example command if you built the pkg)
    installer -pkg native-host/VideoTextHost.pkg -target CurrentUserHomeDirectory
    ```
    > *Note: Release binaries coming soon.*

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

## Architecture

This project uses a hybrid architecture to combine the convenience of a browser extension with the power of native code.

-   **Frontend**: React 19 + TypeScript + Vite (Chrome Side Panel)
-   **Backend**: Python (FastAPI) + SQLite
-   **Core Engines**:
    -   `yt-dlp`: For robust video/audio downloading.
    -   `faster-whisper`: For high-performance local AI transcription.
-   **Bridge**: Chrome Native Messaging (connects extension to local Python process).

## Troubleshooting

-   **"Native host has exited"**: Check if `host-macos.sh` is executable and the path in `manifest.json` is correct.
-   **Permission Denied**: Run `chmod +x` on all scripts in `native-host/`.
-   **Download Error**: Integrating cookies for Bilibili 1080p requires the extension to read cookies for `.bilibili.com`.

## Roadmap

- [ ] **Cloud Transcription Service**: Optional server-side processing for faster transcription and higher model quality (may involve fees).
- [ ] **Batch Processing**: Support for transcribing multiple videos at once.
- [ ] **Custom Model Selection**: Allow users to choose between different Whisper model sizes (base/small/medium).

## Contributing

Pull requests are welcome! Please make sure to update tests as appropriate.
