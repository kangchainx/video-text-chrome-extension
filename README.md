# video-text-chrome-extension

This project is a Chrome Side Panel transcription tool. The extension only manages the task panel and downloads. All downloading and transcription happen in a local Python service (yt-dlp + faster-whisper). Tasks run in a serial queue.

## Architecture

- **Extension**: create tasks, show progress, download txt, manage queue
- **Local Python service**: download audio, transcribe, generate txt, expose HTTP/SSE
- **Native Host**: starts/ensures the local service and returns port + token

## Local Python Service

### 1) Create venv and install dependencies
```bash
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
# Windows: .venv\Scripts\activate

pip install -r requirements-mini.txt
```

### 2) Run service (debug)
```bash
python mini_transcriber.py
```
The service listens on `http://127.0.0.1:8001`. The token is written to `temp/service.token` (relative to the service script directory).

### 3) Extra dependency (YouTube n challenge)
Install Node.js so yt-dlp can use the EJS runtime. Restart the service after installing Node.

### Optional environment variables
- `WHISPER_MODEL`: tiny/base/small/medium/large/large-v2/large-v3
- `WHISPER_DEVICE`: cpu / cuda
- `WHISPER_COMPUTE`: int8 / float16 / float32
- `TRANSCRIBER_PORT`: service port (default 8001)
- `TRANSCRIBER_TOKEN`: fixed token (auto-generated if not set)
- `TRANSCRIBER_TOKEN_PATH`: token file path (default: `temp/service.token`)
- `TRANSCRIBER_DB_PATH`: SQLite db path (default: `temp/tasks.db`)

### Persistence (SQLite)
Tasks are persisted to SQLite at `temp/tasks.db`. On service restart:
- queued tasks are restored
- tasks that were in progress are marked as `error` with an "interrupted" message

## Native Host (macOS)

1) Install Node.js
2) Keep these files in the **same folder** (recommended)
   - Example: `~/video-text-host/`
   - Required files:
     - `host-macos.sh`
     - `host.cjs`
     - `mini_transcriber.py`
3) Make them executable:
```bash
chmod +x ~/video-text-host/host.cjs
chmod +x ~/video-text-host/host-macos.sh
```
4) Install host manifest (recommended):
```bash
chmod +x native-host/install-macos.sh
./native-host/install-macos.sh <EXTENSION_ID>
```
5) Or manually copy manifest:
```bash
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts
cp native-host/com.video_text.transcriber.json \
  ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```
6) Edit `com.video_text.transcriber.json`
- Set `path` to your local `~/video-text-host/host-macos.sh`
- Set `allowed_origins` to your extension ID (`chrome-extension://<ID>/`)

> Extension ID is visible on `chrome://extensions`.

### Native Host environment variables
- `PYTHON_BIN`: path to Python binary
- `TRANSCRIBER_SCRIPT`: absolute path to `mini_transcriber.py` (only if not colocated)
- `TRANSCRIBER_PORT`: service port
- `TRANSCRIBER_TOKEN_PATH`: token file path
- `NATIVE_HOST_LOG_PATH`: host log file path

### Logs and token location (recommended layout)
If you use `~/video-text-host/` as the host directory, logs and token are stored under:
```
~/video-text-host/temp/
  service.token
  native-host.log
  native-host-wrapper.log
  tasks.db
```

## Extension Dev

```bash
npm run dev
```
Load `dist` in `chrome://extensions`, then click “Reload”.

## Usage

1) Open a YouTube/Bilibili video page
2) Click the extension icon to open the side panel
3) Click **Create transcription task**
4) Track download/transcription progress
5) Click **Download TXT** when done

## Cookies (B2)

- The service first tries `cookies-from-browser`
- If download fails due to cookies, the extension automatically reads site cookies and retries

## HTTP API

- `GET /api/tasks`: list tasks
- `GET /api/tasks/stream`: SSE updates
- `GET /api/tasks/{id}/result`: download txt

All endpoints require token (`Authorization: Bearer <token>` or `?token=<token>`).

## Troubleshooting

### 1) Native Host cannot connect
In the extension Service Worker console:
```js
chrome.runtime.sendNativeMessage('com.video_text.transcriber', { type: 'getStatus' }, console.log)
```
Check:
- `Native host has exited` usually means the manifest `path` is wrong or the host script is not executable.
- Verify manifest:
  ```bash
  cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json
  ```
  Ensure `path` points to `~/video-text-host/host-macos.sh`.
- Reinstall manifest:
  ```bash
  chmod +x native-host/install-macos.sh
  ./native-host/install-macos.sh <EXTENSION_ID>
  ```
- Logs:
  - `temp/native-host-wrapper.log` (node/python discovery)
  - `temp/native-host.log` (host events)

### 2) Check service health
```bash
curl http://127.0.0.1:8001/health
```
Expected response: `{ "status": "ok" }`

### 3) Token mismatch
Compare `temp/service.token` with the token shown in the extension. Remove the token file and restart the service if needed.
