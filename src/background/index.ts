// Background Service Worker
// 负责侧边栏行为与安装引导

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: any) => console.error(error))

// 插件安装后弹出引导页
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' })
  }
})
