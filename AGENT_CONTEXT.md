# Project Context & State
> Last Updated: 2026-01-08 22:28

## ⚠️ 最新问题：Android/iOS 客户端与 Cookies 冲突（已修复 ✅）


### 问题历史

#### 1. Broken Pipe 错误（已解决 ✅）
- **症状**: `[Errno 32] Broken pipe` 错误
- **根本原因**:
  1. `ffmpeg_location` 参数错误使用完整二进制路径而非目录路径
  2. FFmpeg 路径中包含空格（"Application Support"），导致 subprocess 调用失败
  3. `MyLogger` 类缺少 `error()` 方法
- **修复**: 已在 commit bd3c189 中修复

#### 2. YouTube 403 Forbidden 错误（已解决 ✅）
- **症状**: `HTTP Error 403: Forbidden` 错误，YouTube 视频无法下载
- **根本原因**:
  - **Chrome Extension Cookie 权限不足**：`manifest.json` 中的 `host_permissions` 不完整
  - 前端虽然实现了 Cookie 自动收集功能，但由于权限限制，`chrome.cookies.getAll()` 返回空数组
  - 后端收到空的 cookies 数组后，不会创建 cookiefile，导致 yt-dlp 无法使用 cookies
  - 没有 cookies 的情况下，YouTube 会返回 403 错误

#### 3. Android/iOS 客户端与 Cookies 冲突（已解决 ✅）
- **症状**: `ERROR: [youtube] XCqFwufI_KM: Requested format is not available`
  - 日志显示: `Skipping client "android" since it does not support cookies`
  - 日志显示: `Skipping client "ios" since it does not support cookies`
  - 日志显示: `Only images are available for download`
  
- **根本原因**:
  - 代码在 `_download_audio()` 中硬编码了 `extractor_args: {'youtube': {'player_client': ['android', 'ios']}}`
  - Android 和 iOS 客户端**不支持 cookies**
  - 当用户登录并提供 cookies 时，yt-dlp 会跳过这两个客户端
  - 结果：没有可用的客户端来下载视频，只能看到图片（缩略图）
  
- **修复**: 
  - 动态配置客户端策略：
    - **有 cookies（已登录）**：使用默认客户端（web），不设置 `player_client`
    - **无 cookies（未登录）**：使用 `android/ios` 客户端绕过某些限制
  - 修改位置: `mini_transcriber.py` 第 892-910 行

### 根本原因分析

**Cookie 权限问题**：

1. **manifest.json 权限不足**（修复前）:
   ```json
   "host_permissions": [
     "https://www.youtube.com/*",  // 仅限 www 子域名
     "https://www.bilibili.com/*"
   ]
   ```

2. **前端 Cookie 域名映射**:
   ```javascript
   const COOKIE_DOMAINS = {
     'youtube.com': 'youtube.com',      // 无权限 ❌
     'www.youtube.com': 'youtube.com',  // 有权限 ✅
     'm.youtube.com': 'youtube.com',    // 无权限 ❌
     'youtu.be': 'youtube.com',         // 无权限 ❌
   }
   ```

3. **后端 Cookie 处理逻辑**:
   ```python
   if payload.cookies:  # 空数组 [] 会被判定为 False
       cookiefile_path = str(_cookiefile_path(task_id))
       _write_cookies_file(payload.cookies, Path(cookiefile_path))
   ```

### 应用的修复

**manifest.json** (修复 Cookie 权限):
```json
"host_permissions": [
  "https://*.youtube.com/*",    // 使用通配符覆盖所有子域名
  "https://youtu.be/*",          // 添加短链接域名
  "https://*.bilibili.com/*",    // 同样修复 Bilibili
  "http://127.0.0.1/*"
]
```

### 技术细节

**为什么需要这些权限：**
- Chrome Extension 的 `chrome.cookies.getAll()` API 需要明确的 host_permissions
- 用户可能从不同的 YouTube 域名访问视频（youtube.com, www.youtube.com, m.youtube.com, youtu.be）
- 使用通配符 `*.youtube.com` 可以覆盖所有子域名（www, m, music 等）
- YouTube cookies（特别是登录状态）对于避免 403 错误至关重要

**修复链路：**
1. 用户在 YouTube 页面点击"添加任务"
2. 前端调用 `chrome.cookies.getAll({ domain: 'youtube.com' })`
3. **现在有权限了** → 返回实际的 cookies（SAPISID, HSID 等）
4. 后端收到 cookies → 创建 Netscape 格式的 cookiefile
5. yt-dlp 使用 cookiefile → 模拟已登录用户 → 绕过 403 错误

### 验证步骤

需要重新加载 Chrome Extension 并测试：
1. 在 Chrome 中访问 `chrome://extensions/`
2. 点击刷新按钮重新加载扩展
3. 访问一个 YouTube 视频页面
4. 点击扩展图标，添加转录任务
5. 检查是否成功下载（不再出现 403 错误）

### 下一步
1. ✅ 修复 Android/iOS 客户端与 Cookies 冲突问题
2. ⏳ 重启服务并测试修复（服务会在下次 Chrome Extension 交互时自动重启）
3. ⏳ 测试有 cookies 的 YouTube 视频下载
4. ⏳ 测试无 cookies 的 YouTube 视频下载（验证降级策略）
5. ⏳ 测试通过后提交代码到 GitHub
