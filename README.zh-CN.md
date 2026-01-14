<div align="center">

<img src="public/logos/promo-small-440x280.png" width="100%" alt="Video Text Chrome Extension Logo" />

**你的私人、无限、本地转录工作室。**

一个高级 Chrome 侧边栏工具，利用本地 AI 算力将视频转换为文字。安全、免费且无限制。

[![GitHub Stars](https://img.shields.io/github/stars/kangchainx/video-text-chrome-extension?style=flat-square&logo=github)](https://github.com/kangchainx/video-text-chrome-extension/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/kangchainx/video-text-chrome-extension?style=flat-square&logo=github)](https://github.com/kangchainx/video-text-chrome-extension/network/members)
[![License](https://img.shields.io/github/license/kangchainx/video-text-chrome-extension?style=flat-square)](https://github.com/kangchainx/video-text-chrome-extension/blob/main/LICENSE)
[![Issues](https://img.shields.io/github/issues/kangchainx/video-text-chrome-extension?style=flat-square)](https://github.com/kangchainx/video-text-chrome-extension/issues)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

## 为什么选择本扩展？

与有时间限制和隐私风险的云端服务不同，本扩展完全在你的机器上运行。

-   🔒 **隐私至上**：所有数据都保留在 `localhost`。音频从未上传到云端。
-   ♾️ **无限使用**：没有月度限制，没有文件大小限制。免费转录 5 小时的讲座或播客。
-   🎬 **支持登录视频**：通过复用浏览器 Cookie，支持从 Bilibili 等网站下载并转录高清视频（1080p+）。
-   🚀 **强大的本地后端**：使用本地 Python 服务（FastAPI + yt-dlp + faster-whisper）绕过浏览器限制。

---

## 安装（普通用户）

### 方案 A：一键安装（推荐）
*(适用于大多数用户)*

**macOS 用户**:
复制并粘贴以下命令到终端中运行：
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/kangchainx/video-text-chrome-extension/main/native-host/install_mac.sh)"
```
（或者从 [最新发布页面](https://github.com/kangchainx/video-text-chrome-extension/releases/latest) 下载 `install_mac.sh` 并运行）

**Windows 用户**:
1. 从 [最新发布页面](https://github.com/kangchainx/video-text-chrome-extension/releases/latest) 下载 `install_win.ps1`。
2. 右键点击文件，选择 **"使用 PowerShell 运行"**。

脚本将会自动完成以下步骤：
1. 下载最新的 Native Host 服务包。
2. 将其安装到你的用户目录。
3. 向 Chrome/Edge 浏览器注册 Native Host 配置。

### 方案 B：手动设置（开发者）

如果你更喜欢从源码运行 Python 服务，或正在开发扩展。

#### 1. 扩展设置
```bash
npm install
npm run dev
# 在 chrome://extensions 中加载 'dist' 目录
```

#### 2. 本地服务设置

**前提条件**：Python 3.10+，Node.js（用于 YouTube 验证）

```bash
# 1. 创建虚拟环境
python -m venv .venv
source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements-mini.txt

# 3. 设置 Native Host（macOS）
chmod +x native-host/install-macos.sh
./native-host/install-macos.sh <YOUR_EXTENSION_ID>
# 你可以在 chrome://extensions 中找到 ID
```

#### 3. 运行服务
开发时，你可以手动运行服务以查看日志：
```bash
python mini_transcriber.py
```
*端口*: `8001`（默认）

---

## 使用方法

1.  **打开视频**：导航到 YouTube 或 Bilibili 视频页面。
2.  **打开面板**：点击扩展图标打开侧边栏。
3.  **转录**：点击 **"创建转写任务"**。
4.  **等待 & 下载**：任务在后台运行。完成后，点击 **"下载 TXT"**。

---

## 📝 版本历史

### v1.0.1 (2026-01-15)

**✨ 新功能**
- 添加本地服务手动重新检测功能
- 未安装本地服务时自动禁用"添加任务"按钮
- 在安装引导面板添加"重新检测"按钮

**🚀 性能优化**
- 移除启动遮罩的10秒延迟，服务就绪后立即关闭
- 优化本地服务检测流程，组件挂载时提前检查
- 修复遮罩状态控制逻辑，正确处理所有服务状态

**💡 用户体验改进**
- 优化新手引导启动时机，仅在服务就绪且遮罩关闭后启动
- 移除服务状态徽章的点击交互，简化为纯展示组件
- 更清晰的安装状态提示和错误反馈

**🐛 问题修复**
- 修复首次启动时的服务连接问题
- 修复overlay在starting状态时的控制逻辑
- 清理调试代码，减少控制台输出

### v1.0.0 (2026-01-XX)
- 首次发布
- 基础视频转文字功能
- 支持 YouTube 和 Bilibili
- 本地 AI 转录（Faster-Whisper）

---

## 架构

本项目采用混合架构，结合了浏览器扩展的便捷性和原生代码的强大功能。

-   **前端**：React 19 + TypeScript + Vite（Chrome 侧边栏）
-   **后端**：Python (FastAPI) + SQLite
-   **核心引擎**：
    -   `yt-dlp`：用于强大的视频/音频下载。
    -   `faster-whisper`：用于高性能本地 AI 转录。
-   **桥接**：Chrome Native Messaging（连接扩展与本地 Python 进程）。

## 常见问题

### "Native host has exited" / 扩展无法连接到服务

**症状**：扩展显示连接错误或"本地服务未安装"，即使已经完成安装。

**可能原因**：

1. **扩展 ID 不匹配**（最常见）

   系统中有**两个** manifest.json 文件：
   - **源文件**：`~/Library/Application Support/VideoTextHost/manifest.json`（macOS）
     - 由安装程序生成，包含正确的扩展 ID
     - 作为模板使用，但 Chrome **不会读取**这个文件

   - **Chrome 实际使用的文件**：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json`
     - 这是 Chrome 真正读取的配置文件
     - 在安装时从源文件复制而来

   **问题所在**：如果你更新了扩展或使用不同的 ID 重新安装，源文件会被更新，但 Chrome 的文件可能仍然保留旧的 ID。

   **解决方法**：
   ```bash
   # macOS：检查两个文件的扩展 ID 是否一致
   cat ~/Library/Application\ Support/VideoTextHost/manifest.json
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json

   # 如果不一致，复制正确的文件：
   cp ~/Library/Application\ Support/VideoTextHost/manifest.json \
      ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json

   # 然后在 chrome://extensions 中重新加载扩展
   ```

2. **脚本没有执行权限**
   ```bash
   chmod +x ~/Library/Application\ Support/VideoTextHost/host-macos.sh
   ```

3. **manifest 中的路径不正确**

   验证 Chrome manifest 中的 `path` 字段指向正确位置：
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json
   ```

### 权限被拒绝（Permission Denied）

对 `native-host/` 目录下的所有脚本运行 `chmod +x` 命令。

### 下载错误（403 / 401）

-   **YouTube**：通常无需 cookies，使用移动端客户端模拟即可正常工作。
-   **Bilibili 1080p**：需要 cookies 支持。扩展需要读取 `.bilibili.com` 域的 Cookie 权限。
-   查看 `temp/service.log` 文件获取详细错误信息。

### 首次转录很慢 / 找不到模型

-   首次运行时会下载约 150MB 的 Whisper 模型到缓存目录（`~/.cache/whisper` 或 `~/.cache/faster-whisper`）
-   后续的转录任务会快得多
-   可以设置 `WHISPER_MODEL_DIR` 环境变量来指定自定义缓存位置

## 后续计划

- [ ] **云端转录服务**：增加可选的服务器端处理，提供更快的转写速度和更高质量的模型（可能收取一定费用）。
- [ ] **批量处理**：支持一次处理多个视频任务。
- [ ] **自定义模型选择**：允许用户在不同的 Whisper 模型大小（base/small/medium）之间进行选择。

## 隐私与数据保护

🔒 **您的隐私很重要**。本扩展：
- ✅ 所有数据在您的机器上**本地处理**
- ✅ **绝不上传**视频内容或转录文本到任何云服务器
- ✅ 仅使用 cookies 访问您已授权查看的高清视频
- ✅ 不收集任何分析数据、追踪数据或个人信息

详细信息请参阅我们的 [隐私政策](PRIVACY.md)。

---

## 贡献

欢迎提交 Pull Request！请确保更新相应的测试。

## 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

