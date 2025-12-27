// Background Service Worker
// 负责消息转发

console.log('[bg] loaded')
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .then(() => console.log('[bg] setPanelBehavior openPanelOnActionClick=false'))
  .catch((error: any) => console.error('[bg] setPanelBehavior error', error))
// 点击扩展图标打开侧边栏，并记录当前标签用于录制
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return
  console.log('[bg] action.onClicked', { tabId: tab.id, url: tab.url })
  chrome.storage.session.set({
    invokedTabId: tab.id,
    invokedTabUrl: tab.url ?? '',
  })
  chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
    const captureError = chrome.runtime.lastError?.message ?? ''
    console.log('[bg] tabCapture.getMediaStreamId', {
      tabId: tab.id,
      streamId,
      captureError,
    })
    chrome.storage.session.set({
      pendingStreamId: streamId || '',
      pendingStreamAt: Date.now(),
      pendingStreamError: captureError,
    })
  })
  chrome.sidePanel
    .setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true })
    .catch((error: any) => console.error(error))
  chrome.sidePanel.open({ tabId: tab.id }).catch((error: any) => console.error(error))
})

// 插件安装后弹出引导页
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' })
  }
})
