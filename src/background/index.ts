// Background Service Worker
// 负责侧边栏行为、任务管理与通知

import { taskManager } from './taskManager'

const sidepanelPorts = new Set<chrome.runtime.Port>()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return

  sidepanelPorts.add(port)
  if (sidepanelPorts.size === 1) {
    taskManager.setSidepanelOpen(true)
  }

  port.onDisconnect.addListener(() => {
    sidepanelPorts.delete(port)
    if (sidepanelPorts.size === 0) {
      taskManager.setSidepanelOpen(false)
    }
  })
})

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: any) => console.error(error))

// 插件安装后弹出引导页
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' })
  }
})

// 监听来自sidepanel的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log('[Background] Received message', message.type)

  switch (message.type) {
    case 'START_SSE':
      taskManager.startSSE(message.port, message.token)
      sendResponse({ ok: true })
      break

    case 'STOP_SSE':
      taskManager.stopSSE()
      sendResponse({ ok: true })
      break

    case 'GET_TASKS':
      sendResponse(taskManager.getTasks())
      break

    default:
      sendResponse({ error: 'Unknown message type' })
  }

  return true // Keep message channel open for async responses
})

// Service Worker keep-alive to prevent SSE disconnection
// Chrome can suspend inactive service workers after 30 seconds
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // console.log('[Background] Keep alive ping')
  }
})
