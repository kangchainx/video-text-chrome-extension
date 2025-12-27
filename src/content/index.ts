// Content Script
// 负责检测视频源和提取原生字幕

const detectVideo = () => {
    // 检查扩展上下文是否仍然有效
    if (!chrome.runtime?.id) {
        observer.disconnect();
        return;
    }

    try {
        const video = document.querySelector('video');
        const detected = !!video;
        chrome.runtime.sendMessage({ type: 'VIDEO_DETECTED', detected });
        return detected;
    } catch (e) {
        // 如果环境失效，断开观察器
        observer.disconnect();
    }
}

// 使用 MutationObserver 监听 DOM 变化，比 setInterval 更环保且不会报错
const observer = new MutationObserver(() => {
    detectVideo();
});

observer.observe(document.body, { childList: true, subtree: true });

// 初始检查
detectVideo();

// 监听来自 Sidepanel 的请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_VIDEO_STATUS') {
        const video = document.querySelector('video');
        sendResponse({ detected: !!video });
    }
    // 注意：同步响应不需要返回 true
});
