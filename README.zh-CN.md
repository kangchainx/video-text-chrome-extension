# video-text-chrome-extension

[English](README.md) | 中文

这是一个 Chrome 侧边栏转写工具。扩展只负责任务面板与下载，所有下载与转写都在本地 Python 服务中完成（yt-dlp + faster-whisper）。任务按队列串行处理。

## 架构

- **扩展**：创建任务、展示进度、下载 txt、管理队列
- **本地 Python 服务**：下载音频、转写、生成 txt、提供 HTTP/SSE
- **Native Host**：启动/确保本地服务运行，并返回端口与 token

## 本地 Python 服务

### 1) 创建虚拟环境并安装依赖
```bash
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
# Windows: .venv\Scripts\activate

pip install -r requirements-mini.txt
```

### 2) 启动服务（调试）
```bash
python mini_transcriber.py
```
服务监听 `http://127.0.0.1:8001`。token 默认写入 `temp/service.token`（相对服务脚本目录）。

### 2.1 中文输出规范化
中文转写内容会用 OpenCC 统一为**简体中文**（`opencc-python-reimplemented`）。

### 3) 额外依赖（YouTube n challenge）
安装 Node.js 以便 yt-dlp 使用 EJS 运行时。安装后请重启服务。

### 可选环境变量
- `WHISPER_MODEL`: tiny/base/small/medium/large/large-v2/large-v3
- `WHISPER_DEVICE`: cpu / cuda
- `WHISPER_COMPUTE`: int8 / float16 / float32
- `TRANSCRIBER_PORT`: 服务端口（默认 8001）
- `TRANSCRIBER_TOKEN`: 固定 token（不设置则自动生成）
- `TRANSCRIBER_TOKEN_PATH`: token 文件路径（默认：`temp/service.token`）
- `TRANSCRIBER_DB_PATH`: SQLite 路径（默认：`temp/tasks.db`）

### 持久化（SQLite）
任务会持久化到 `temp/tasks.db`。服务重启后：
- 排队中的任务会恢复
- 处理中任务会标记为 `error`，并写入 “interrupted” 错误

## Native Host（macOS）

### 方案 A：.pkg 安装包（推荐用于分发）

该方式会将 Python 服务打包成独立可执行文件（PyInstaller onedir），**终端用户无需安装 Python**。

构建安装包（仅开发者需要，要求 Python + PyInstaller）：
```bash
python3 -m pip install -r requirements-mini.txt pyinstaller
chmod +x native-host/build-macos-pkg.sh
./native-host/build-macos-pkg.sh <EXTENSION_ID> 1.0.0
```

安装到**当前用户目录**（无需管理员权限）：
```bash
installer -pkg native-host/VideoTextHost.pkg -target CurrentUserHomeDirectory
```

测试打包后的服务（可选）：
```bash
"$HOME/Library/Application Support/VideoTextHost/video-text-transcriber/video-text-transcriber"
```

安装路径：
- Host 目录：`~/Library/Application Support/VideoTextHost/`
- Native Host 清单：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json`

打包后的服务目录：
- `~/Library/Application Support/VideoTextHost/video-text-transcriber`

> 如果直接双击 `.pkg`，macOS 可能安装到系统根目录并要求管理员权限。  
> 推荐使用上述命令安装到用户目录。

卸载（macOS）：
```bash
chmod +x native-host/uninstall-macos.sh
./native-host/uninstall-macos.sh
```

### 方案 B：手动安装

1) 安装 Node.js
2) 将以下文件放到**同一目录**（推荐）
   - 示例目录：`~/video-text-host/`
   - 必需文件：
     - `host-macos.sh`
     - `host.cjs`
     - `mini_transcriber.py`
3) 设置可执行权限：
```bash
chmod +x ~/video-text-host/host.cjs
chmod +x ~/video-text-host/host-macos.sh
```
4) 安装 Host 清单（推荐）：
```bash
chmod +x native-host/install-macos.sh
./native-host/install-macos.sh <EXTENSION_ID>
```
5) 或手动复制清单：
```bash
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts
cp native-host/com.video_text.transcriber.json \
  ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
```
6) 编辑 `com.video_text.transcriber.json`
- `path` 设置为本地 `~/video-text-host/host-macos.sh`
- `allowed_origins` 设置为扩展 ID（`chrome-extension://<ID>/`）

> 扩展 ID 可在 `chrome://extensions` 中查看。

### Native Host 环境变量
- `PYTHON_BIN`: Python 可执行文件路径
- `TRANSCRIBER_SCRIPT`: `mini_transcriber.py` 绝对路径（仅在未同目录时需要）
- `TRANSCRIBER_BIN`: 打包后的 `video-text-transcriber` 路径（存在则优先）
- `TRANSCRIBER_BASE_DIR`: 二进制运行时的基础目录（temp/db/token 所在目录）
- `TRANSCRIBER_PORT`: 服务端口
- `TRANSCRIBER_TOKEN_PATH`: token 文件路径
- `NATIVE_HOST_LOG_PATH`: host 日志路径
- `TRANSCRIBER_CPU_THREADS`: 转写 CPU 线程上限（默认：`2`）
- `TRANSCRIBER_IDLE_SECONDS`: 空闲自动退出（默认：`600`）
- `TRANSCRIBER_SERVICE_LOG`: 服务日志路径（默认：`temp/service.log`）

### 性能默认值
- 默认模型为 `tiny`，降低 CPU/内存占用，适配普通笔记本。
- 转写默认单 worker，线程数限制较低。
- 服务空闲 10 分钟自动退出，避免长期后台运行。

### 日志与 token 位置（推荐布局）
若使用 `~/video-text-host/` 作为 Host 目录，日志与 token 存储在：
```
~/video-text-host/temp/
  service.token
  service.log
  native-host.log
  native-host-wrapper.log
  tasks.db
```

## 扩展开发

```bash
npm run dev
```
在 `chrome://extensions` 中加载 `dist`，然后点击 “Reload”。

## 使用方式

1) 打开 YouTube/Bilibili 视频页
2) 点击扩展图标打开侧边栏
3) 点击 **创建转写任务**
4) 查看下载/转写进度
5) 完成后点击 **下载 TXT**

## Cookies（B2）

- 服务默认先用 `cookies-from-browser`
- 如果因 cookies 失败，扩展会自动读取站点 cookies 并重试

## HTTP API

- `GET /api/tasks`: 任务列表
- `GET /api/status`: 服务与模型状态
- `GET /api/tasks/stream`: SSE 更新
- `GET /api/tasks/{id}/result`: 下载 txt

所有接口需要 token（`Authorization: Bearer <token>` 或 `?token=<token>`）。

## 排错

### 1) Native Host 无法连接
在扩展 Service Worker 控制台执行：
```js
chrome.runtime.sendNativeMessage('com.video_text.transcriber', { type: 'getStatus' }, console.log)
```
检查要点：
- `Native host has exited` 多为 manifest 路径错误或脚本无执行权限。
- 查看 manifest：
  ```bash
  cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json
  ```
  确认 `path` 指向 `~/video-text-host/host-macos.sh`。
- 重新安装 manifest：
  ```bash
  chmod +x native-host/install-macos.sh
  ./native-host/install-macos.sh <EXTENSION_ID>
  ```
- 日志位置：
  - `temp/native-host-wrapper.log`（node/python 查找）
  - `temp/native-host.log`（host 事件）

### 2) 检查服务健康状态
```bash
curl http://127.0.0.1:8001/health
```
