# Project Context & State
> Last Updated: 2026-01-09
> **Notice to AI**: Read this file first to understand the project architecture, dependencies, and rules without scanning the entire codebase.

## 0. 🗺 Project Map (Architecture & Dependencies)
> **Purpose**: Provides a high-level overview to save context window. Defines how modules interact.
* **Project Description**: A Chrome Extension for local video transcription using WebAssembly AI models (via Native Messaging Host running `faster-whisper`).
* **Key Flows**:
    * **User Flow**: User clicks extension in Side Panel -> Selects Video (active tab or URL) -> Native Host downloads audio (yt-dlp) -> Whisper Model transcribes -> Result displayed in Side Panel.
    * **Data Flow**: Chrome Extension <--(Native Messaging/Stdio)--> Node.js Host Wrapper <--(HTTP/API)--> Python Transcription Service.
* **Module Dependencies**:
    * `src/sidepanel`: Main UI (React/Vite). Communicates with `src/background`.
    * `native-host`:
        * `host.cjs`: Node.js wrapper for Native Messaging protocol.
        * `mini_transcriber.py`: Core Python service (FastAPI) for downloading and transcribing.
        * `install_*.{sh,bat}`: Platform-specific installers.

## 1. 🎯 Current Focus
> **Purpose**: Sets the immediate context.
* **Core Task**: Verify Stable Release v0.2.5 (Windows & macOS).
* **Phase**: Release & Polish.

## 2. 🚦 System Status
> **Purpose**: Snapshot of reality. What works, what doesn't.
* **✅ Implemented**:
    * [App] Full transcription pipelne (Download -> Transcribe -> Result).
    * [Core] Deadlock fix in model loading logic.
    * [Performance] Dynamic CPU thread scaling (2-8 cores) based on system hardware.
    * [Install] Windows `.exe` installer & `.bat` scripts; macOS `.sh` installer with "Reinstall/Clear Data" safety checks.
    * [Fix] YouTube Cookies support (403 fix) and Android/iOS client fallback.
    * [Fix] FFmpeg path handling on macOS (Broken Pipe fix).
* **🚧 In Progress**:
    * [Validation] Verifying v0.2.5 release artifacts.

## 3. 🛡 Tech Stack & Constraints
> **Purpose**: Hard boundaries & Rules.
* **Stack**: React 18, Vite, Tailwind CSS, Python 3.11 (FastAPI, faster-whisper, yt-dlp), PyInstaller.
* **Rules**:
    * **Native Messaging**: Communication via Stdin/Stdout (JSON length-prefixed).
    * **Distribution**: Python backend compiled to single-file executable (or folder) via PyInstaller.
    * **Platform Support**: macOS (ARM64 preferred), Windows (x64).

## 4. 📜 Decision Log & History
> **Purpose**: Long-term memory to avoid repeating mistakes.
* **[2026-01-09] Deployment Strategy**: Decided to distribute uninstall scripts as standalone Release Assets (`uninstall_win.bat`, `uninstall_mac.sh`) rather than bundling them inside the application ZIP. This keeps the main payload ("green" software) clean.
* **[2026-01-09] Windows UX**: Switched from PowerShell (`.ps1`) to Batch (`.bat`) wrappers and a pre-compiled `.exe` installer to improve click-to-run experience for average users.
* **[2026-01-09] Performance**: Switched `CPU_THREADS` from hardcoded `2` to `os.cpu_count() // 2` to utilize high-end hardware (e.g., 3070Ti/32GB RAM machines).
* **[2026-01-08] YouTube Fix**: Implemented dynamic `player_client` strategy in `yt-dlp` to handle both logged-in (Cookies) and logged-out states effectively.
