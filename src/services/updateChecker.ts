/**
 * 版本检查服务
 * 负责从本地服务和 GitHub 获取版本信息，并比较版本
 */

// ==== 测试模式开关 ====
// 设置为 true 可以模拟更新可用状态，用于测试 UI
const DEBUG_FORCE_UPDATE = false;
// ======================

const GITHUB_API_URL =
  "https://api.github.com/repos/kangchainx/video-text-chrome-extension/releases/latest";
const LOCAL_HEALTH_URL = "http://127.0.0.1:8001/health";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小时

export interface VersionInfo {
  serviceVersion: string;
  ytdlpVersion: string;
}

export interface UpdateInfo {
  needsUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  error?: string;
}

/**
 * 从本地服务获取版本信息
 */
export async function getLocalVersion(): Promise<VersionInfo | null> {
  try {
    const response = await fetch(LOCAL_HEALTH_URL, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      serviceVersion: data.service_version || "unknown",
      ytdlpVersion: data.ytdlp_version || "unknown",
    };
  } catch (error) {
    console.error("[UpdateChecker] Failed to get local version:", error);
    return null;
  }
}

/**
 * 从 GitHub API 获取最新 Release 信息
 */
export async function getLatestRelease(): Promise<any> {
  try {
    const response = await fetch(GITHUB_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[UpdateChecker] Failed to get latest release:", error);
    throw error;
  }
}

/**
 * 从 Release body 中提取 yt-dlp 版本号
 * 期望格式：Release notes 中包含 "yt-dlp: X.Y.Z" 或 "yt-dlp X.Y.Z"
 */
export function extractYtdlpVersion(releaseBody: string): string | null {
  // 匹配 "yt-dlp: 2026.01.19" 或 "yt-dlp 2026.01.19"
  const patterns = [
    /yt-dlp[:\s]+(\d{4}\.\d{2}\.\d{2})/i,
    /yt-dlp[:\s]+v?(\d{4}\.\d{2}\.\d{2})/i,
    /升级到\s+(\d{4}\.\d{2}\.\d{2})/,
    /upgrade to\s+(\d{4}\.\d{2}\.\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = releaseBody.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * 比较 yt-dlp 版本号（格式：YYYY.MM.DD）
 * @returns 1 = latest 更新，0 = 相同，-1 = current 更新
 */
export function compareVersions(current: string, latest: string): number {
  if (current === "unknown" || latest === "unknown") {
    return 0; // 无法比较
  }

  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  // 确保都是 3 段式版本号
  if (currentParts.length !== 3 || latestParts.length !== 3) {
    return 0;
  }

  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) return 1; // 有新版本
    if (latestParts[i] < currentParts[i]) return -1; // 本地更新
  }

  return 0; // 版本相同
}

/**
 * 检查是否有更新
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    // ==== 测试模式：直接返回模拟数据 ====
    if (DEBUG_FORCE_UPDATE) {
      console.log("[UpdateChecker] DEBUG_FORCE_UPDATE is enabled, returning mock update info");
      return {
        needsUpdate: true,
        currentVersion: "2025.01.01",
        latestVersion: "2026.01.19",
        releaseNotes: "测试更新提示",
        downloadUrl: "https://github.com/kangchainx/video-text-chrome-extension/releases/latest/download/update_mac.sh"
      };
    }
    // =====================================

    // 1. 获取本地版本
    const local = await getLocalVersion();
    if (!local) {
      return {
        needsUpdate: false,
        error: "Failed to get local version",
      };
    }

    // 2. 获取最新 Release
    const release = await getLatestRelease();

    // 3. 从 Release body 中提取 yt-dlp 版本
    const latestYtdlpVersion = extractYtdlpVersion(release.body || "");
    if (!latestYtdlpVersion) {
      console.warn(
        "[UpdateChecker] Could not extract yt-dlp version from release notes",
      );
      return { needsUpdate: false };
    }

    // 4. 比较版本
    const comparison = compareVersions(local.ytdlpVersion, latestYtdlpVersion);

    if (comparison < 0) {
      // 本地版本更新（可能是开发版本），不提示
      return { needsUpdate: false };
    }

    if (comparison > 0) {
      // 有新版本可用
      // 5. 查找更新脚本下载链接
      const updateScript = release.assets?.find(
        (asset: any) =>
          asset.name === "update_mac.sh" || asset.name === "update_windows.exe",
      );

      return {
        needsUpdate: true,
        currentVersion: local.ytdlpVersion,
        latestVersion: latestYtdlpVersion,
        releaseNotes: release.body || "",
        publishedAt: release.published_at,
        downloadUrl: updateScript?.browser_download_url,
      };
    }

    // 版本相同，无需更新
    return { needsUpdate: false };
  } catch (error: any) {
    console.error("[UpdateChecker] Check failed:", error);
    return {
      needsUpdate: false,
      error: error.message,
    };
  }
}

/**
 * 启动定期检查（24 小时一次）
 */
export function startPeriodicCheck(
  onUpdateAvailable: (updateInfo: UpdateInfo) => void,
): () => void {
  // 首次延迟 3 秒检查
  const initialTimeout = setTimeout(async () => {
    const updateInfo = await checkForUpdates();
    if (updateInfo.needsUpdate) {
      onUpdateAvailable(updateInfo);
    }
  }, 3000);

  // 之后每 24 小时检查一次
  const interval = setInterval(async () => {
    const updateInfo = await checkForUpdates();
    if (updateInfo.needsUpdate) {
      onUpdateAvailable(updateInfo);
    }
  }, CHECK_INTERVAL_MS);

  // 返回清理函数
  return () => {
    clearTimeout(initialTimeout);
    clearInterval(interval);
  };
}
