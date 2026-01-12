# Privacy Policy | 隐私政策

**Last Updated | 最后更新**: 2026-01-12  
**Extension Name | 扩展名称**: 视频转文字助手 (Video Text Chrome Extension)

---

## English Version

### Overview
Video Text Chrome Extension processes all data **locally on your computer**. We do not collect, store, or transmit your personal data to any remote servers.

### Data We Access (Local Only)
1. **Browser Cookies** (YouTube & Bilibili)
   - **Purpose**: Download high-quality videos (1080p+) requiring login/membership
   - **Usage**: Temporarily passed to local service (127.0.0.1) during download
   - **Storage**: Not stored persistently
   - **Transmission**: Never sent to external servers

2. **Video Page URLs**
   - **Purpose**: Identify videos for transcription
   - **Storage**: Stored in local SQLite database on your machine
   - **Transmission**: Never sent to external servers

3. **User Preferences** (Language, Tutorial Status)
   - **Storage**: Browser localStorage (local only)
   - **Transmission**: Never sent to external servers

### How We Use Data
All data is used **exclusively** for:
- Downloading videos from YouTube/Bilibili using your cookies
- Local AI transcription with faster-whisper (on your computer)
- Remembering your language preference

### Data Sharing
**We do NOT share any data with third parties.**

Network communication only occurs between:
- Chrome extension ↔ Your local Python service (127.0.0.1)
- Your local service ↔ Video websites (to download videos)

### No Third-Party Services
This extension does **NOT** use:
- ❌ Analytics (e.g., Google Analytics)
- ❌ Tracking or advertising
- ❌ Cloud transcription services
- ❌ Remote logging

### Data Security
- All transcription happens **locally** on your machine
- Communication uses localhost (127.0.0.1) only
- No data uploaded to external servers

### Your Rights
- **Access**: All data is on your local machine
- **Delete**: Delete tasks via UI or delete local database files
- **Export**: Transcripts saved as .txt files you own

### Contact
For questions: [GitHub Issues](https://github.com/kangchainx/video-text-chrome-extension/issues)

---

## 中文版本

### 概述
视频转文字助手在您的计算机上**本地处理所有数据**。我们不会收集、存储或向任何远程服务器传输您的个人数据。

### 我们访问的数据（仅本地）
1. **浏览器 Cookies**（YouTube 和 Bilibili）
   - **目的**：下载需要登录/会员权限的高清视频（1080p+）
   - **使用方式**：下载期间临时传递给本地服务（127.0.0.1）
   - **存储**：不持久化存储
   - **传输**：从不发送到外部服务器

2. **视频页面 URL**
   - **目的**：识别要转录的视频
   - **存储**：存储在您机器上的本地 SQLite 数据库
   - **传输**：从不发送到外部服务器

3. **用户偏好**（语言、教程状态）
   - **存储**：浏览器 localStorage（仅本地）
   - **传输**：从不发送到外部服务器

### 数据使用方式
所有数据**仅**用于：
- 使用您的 cookies 从 YouTube/Bilibili 下载视频
- 使用 faster-whisper 在您的计算机上进行本地 AI 转录
- 记住您的语言偏好

### 数据共享
**我们不与任何第三方共享数据。**

网络通信仅发生在：
- Chrome 扩展 ↔ 您的本地 Python 服务（127.0.0.1）
- 您的本地服务 ↔ 视频网站（下载视频）

### 不使用第三方服务
本扩展**不使用**：
- ❌ 分析服务（如 Google Analytics）
- ❌ 追踪或广告
- ❌ 云端转录服务
- ❌ 远程日志

### 数据安全
- 所有转录在您的机器上**本地**进行
- 通信仅使用 localhost（127.0.0.1）
- 不上传数据到外部服务器

### 您的权利
- **访问**：所有数据都在您的本地机器上
- **删除**：通过界面删除任务或删除本地数据库文件
- **导出**：转录文本保存为您拥有的 .txt 文件

### 联系方式
如有疑问：[GitHub Issues](https://github.com/kangchainx/video-text-chrome-extension/issues)

---

**Repository**: [https://github.com/kangchainx/video-text-chrome-extension](https://github.com/kangchainx/video-text-chrome-extension)
