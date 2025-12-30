import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  DownloadSimple,
  Plus,
  Power,
  Trash,
  WarningCircle,
  X,
} from 'phosphor-react'

const NATIVE_HOST_NAME = 'com.video_text.transcriber'

type TaskStatus = 'queued' | 'downloading' | 'transcribing' | 'done' | 'error' | 'canceled'

interface TaskItem {
  id: string
  url: string
  title?: string
  site?: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
  downloadProgress: number
  transcribeProgress: number
  errorCode?: string
  errorMessage?: string
  resultFilename?: string
  queuePosition?: number | null
}

interface TasksSnapshot {
  tasks: TaskItem[]
  activeTaskId: string | null
}

type DiagnosticStage = 'idle' | 'running' | 'result'
type DiagnosticStatus = 'pending' | 'running' | 'done' | 'fail'

interface DiagnosticStep {
  id: string
  label: string
  status: DiagnosticStatus
}

type ToastKind = 'info' | 'error' | 'success'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  closing: boolean
  duration: number
}

type TourPlacement = 'top' | 'bottom'

interface TourStep {
  key: string
  title: string
  content: string
}

const App: React.FC = () => {
  const [serviceStatus, setServiceStatus] = useState<'idle' | 'connecting' | 'starting' | 'ready' | 'error'>('idle')
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [servicePort, setServicePort] = useState<number | null>(null)
  const [serviceToken, setServiceToken] = useState<string | null>(null)
  const [modelCached, setModelCached] = useState<boolean | null>(null)
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  const [modelLoading, setModelLoading] = useState<boolean | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [overlayHiding, setOverlayHiding] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [visibleCount, setVisibleCount] = useState(5)
  const [filter, setFilter] = useState<'active' | 'done'>('active')
  const [hasSnapshot, setHasSnapshot] = useState(false)
  const [animateKey, setAnimateKey] = useState(0)
  const [diagnosticStage, setDiagnosticStage] = useState<DiagnosticStage>('idle')
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[]>([])
  const [diagnosticResult, setDiagnosticResult] = useState<{
    ok: boolean
    title: string
    detail: string
    actions: string[]
  } | null>(null)
  const [progressTarget, setProgressTarget] = useState(0)
  const [progressValue, setProgressValue] = useState(0)
  const [diagnosticRunId, setDiagnosticRunId] = useState(0)
  const [pendingCancel, setPendingCancel] = useState<TaskItem | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [tourMode, setTourMode] = useState<'auto' | 'manual' | null>(() => {
    try {
      const seen = window.localStorage.getItem('video_text_onboarding')
      return seen ? null : 'auto'
    } catch {
      return 'auto'
    }
  })
  const [tourStep, setTourStep] = useState(0)
  const [tourClipPath, setTourClipPath] = useState('polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0)')
  const [tourPlacement, setTourPlacement] = useState<TourPlacement>('bottom')
  const [tourBubblePos, setTourBubblePos] = useState({ top: 0, left: 0 })
  const [tourRect, setTourRect] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true)

  const sseRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const statusPollRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const overlayStartRef = useRef<number>(Date.now())
  const overlayLockedRef = useRef(true)
  const healthPollRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const toastTimersRef = useRef<Map<string, number[]>>(new Map())
  const ensureInFlightRef = useRef<Promise<{ port: number; token: string }> | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const serviceBadgeRef = useRef<HTMLDivElement | null>(null)
  const createButtonRef = useRef<HTMLButtonElement | null>(null)
  const listAreaRef = useRef<HTMLDivElement | null>(null)
  const clearQueueRef = useRef<HTMLButtonElement | null>(null)

  const apiBase = useMemo(() => {
    if (!servicePort) return null
    return `http://127.0.0.1:${servicePort}`
  }, [servicePort])

  const tourSteps: TourStep[] = useMemo(
    () => [
      { key: 'status', title: '服务连接', content: '等待本地服务连接成功。' },
      { key: 'create', title: '创建任务', content: '浏览器打开你喜欢的视频，创建转写任务。' },
      {
        key: 'list',
        title: '任务进度',
        content: '在这里查看实时任务进度与已完成的任务并下载文件。',
      },
      { key: 'clear', title: '清空队列', content: '点击一键清空等待中的任务。' },
    ],
    []
  )

  const taskStats = useMemo(() => {
    const inProgress = tasks.filter((task) =>
      ['queued', 'downloading', 'transcribing'].includes(task.status)
    ).length
    const done = tasks.filter((task) =>
      ['done', 'canceled', 'error'].includes(task.status)
    ).length
    return { inProgress, done }
  }, [tasks])

  const filteredTasks = useMemo(() => {
    if (filter === 'active') {
      return tasks.filter((task) =>
        ['queued', 'downloading', 'transcribing'].includes(task.status)
      )
    }
    if (filter === 'done') {
      const completed = tasks.filter((task) => ['done', 'canceled', 'error'].includes(task.status))
      completed.sort((a, b) => b.createdAt - a.createdAt)
      return completed
    }
    const active = tasks.filter((task) =>
      ['queued', 'downloading', 'transcribing'].includes(task.status)
    )
    active.sort((a, b) => b.createdAt - a.createdAt)
    return active
  }, [tasks, filter])

  const visibleTasks = useMemo(
    () => filteredTasks.slice(0, visibleCount),
    [filteredTasks, visibleCount]
  )

  useEffect(() => {
    setVisibleCount(5)
    setAnimateKey((prev) => prev + 1)
  }, [filter])

  useEffect(() => {
    progressRef.current = progressValue
  }, [progressValue])

  useEffect(() => {
    const from = progressRef.current
    const to = progressTarget
    if (from === to) return
    const duration = 420
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const elapsed = Math.min((now - start) / duration, 1)
      const next = Math.round(from + (to - from) * elapsed)
      setProgressValue(next)
      if (elapsed < 1) {
        raf = window.requestAnimationFrame(tick)
      }
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [progressTarget])

  useEffect(() => {
    if (tourMode !== 'auto') return
    try {
      window.localStorage.setItem('video_text_onboarding', '1')
    } catch {
      // ignore
    }
  }, [tourMode])

  useEffect(() => {
    if (!tourMode) return
    if (tourStep === 2) {
      setFilter('active')
    }
  }, [tourMode, tourStep])

  useEffect(() => {
    if (!tourMode) return
    const updateLayout = () => {
      const step = tourSteps[tourStep]
      if (!step) return
      const target =
        step.key === 'status'
          ? serviceBadgeRef.current
          : step.key === 'create'
            ? createButtonRef.current
            : step.key === 'list'
              ? listAreaRef.current
              : step.key === 'clear'
                ? clearQueueRef.current
                : null
      if (!target) return
      const rect = target.getBoundingClientRect()
      const padding = 8
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const left = Math.max(rect.left - padding, 0)
      const top = Math.max(rect.top - padding, 0)
      const right = Math.min(rect.right + padding, viewportWidth)
      const bottom = Math.min(rect.bottom + padding, viewportHeight)
      const clipPath = `polygon(0 0, ${viewportWidth}px 0, ${viewportWidth}px ${viewportHeight}px, 0 ${viewportHeight}px, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`
      setTourClipPath(clipPath)
      setTourRect({ top, left, width: right - left, height: bottom - top })
      const centerX = left + (right - left) / 2
      const bubbleWidth = 280
      const safeLeft = Math.min(Math.max(centerX, bubbleWidth / 2 + 16), viewportWidth - bubbleWidth / 2 - 16)
      const bottomSpace = viewportHeight - bottom
      const topSpace = top
      let placement: TourPlacement = 'bottom'
      if (topSpace > bottomSpace && topSpace > 160) {
        placement = 'top'
      }
      setTourPlacement(placement)
      setTourBubblePos({
        top: placement === 'bottom' ? bottom + 16 : top - 16,
        left: safeLeft,
      })
    }
    updateLayout()
    const handleScroll = () => updateLayout()
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [tourMode, tourStep, tourSteps, filter])

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timers) =>
        timers.forEach((timer) => window.clearTimeout(timer))
      )
      toastTimersRef.current.clear()
      if (overlayTimerRef.current) {
        window.clearTimeout(overlayTimerRef.current)
      }
      if (statusPollRef.current) {
        window.clearInterval(statusPollRef.current)
      }
      if (healthPollRef.current) {
        window.clearInterval(healthPollRef.current)
      }
    }
  }, [])

  useEffect(() => {
    overlayStartRef.current = Date.now()
    overlayLockedRef.current = true
    setOverlayVisible(true)
    setOverlayHiding(false)
  }, [])

  useEffect(() => {
    if (tourMode !== 'auto') return
    overlayLockedRef.current = false
    setOverlayVisible(false)
    setOverlayHiding(false)
  }, [tourMode])

  useEffect(() => {
    if (serviceStatus === 'starting') {
      setModelLoading(true)
    }
  }, [serviceStatus])

  const connectNative = () => {
    return new Promise<{ port: number; token: string; status?: string }>((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { type: 'ensureRunning' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          if (!response?.ok) {
            reject(new Error(response?.error || '无法连接本地服务'))
            return
          }
          resolve({ port: response.port, token: response.token, status: response.status })
        }
      )
    })
  }

  const sendNative = (type: 'getStatus' | 'ensureRunning' | 'shutdown') => {
    return new Promise<any>((resolve, reject) => {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { type }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response?.ok) {
          reject(new Error(response?.error || 'native_error'))
          return
        }
        resolve(response)
      })
    })
  }

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    if (!apiBase || !serviceToken) {
      throw new Error('本地服务未连接')
    }
    const headers = new Headers(options.headers)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    headers.set('Authorization', `Bearer ${serviceToken}`)
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
    })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || '请求失败')
    }
    return response
  }

  const refreshTasks = async () => {
    try {
      const response = await apiFetch('/api/tasks')
      const data = (await response.json()) as TasksSnapshot
      setTasks(data.tasks)
      setActiveTaskId(data.activeTaskId)
      setHasSnapshot(true)
    } catch (error) {
      console.error(error)
    }
  }

  const fetchServiceStatus = async () => {
    try {
      const response = await apiFetch('/api/status')
      const data = (await response.json()) as {
        modelCached?: boolean
        modelReady?: boolean
        modelLoading?: boolean
      }
      setModelCached(Boolean(data.modelCached))
      setModelReady(Boolean(data.modelReady))
      setModelLoading(Boolean(data.modelLoading))
      return data
    } catch (error) {
      console.error(error)
      setModelCached(false)
      setModelReady(false)
      setModelLoading(true)
      return null
    }
  }

  const waitForHealth = async (port: number, timeoutMs = 60000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`)
        if (response.ok) {
          return true
        }
      } catch (error) {
        // ignore
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }
    return false
  }

  const startSse = () => {
    if (!apiBase || !serviceToken) return
    if (sseRef.current) {
      sseRef.current.close()
    }
    setSseStatus('connecting')
    const url = `${apiBase}/api/tasks/stream?token=${encodeURIComponent(serviceToken)}`
    const eventSource = new EventSource(url)
    sseRef.current = eventSource
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TasksSnapshot
        setTasks(data.tasks)
        setActiveTaskId(data.activeTaskId)
        setSseStatus('connected')
        setHasSnapshot(true)
      } catch (error) {
        console.error(error)
      }
    }
    eventSource.onerror = () => {
      setSseStatus('error')
      eventSource.close()
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        startSse()
      }, 1200)
    }
  }

  const ensureService = async (waitForReady = false) => {
    if (tourMode === 'auto') {
      throw new Error('tour_active')
    }
    if (ensureInFlightRef.current) {
      return ensureInFlightRef.current
    }
    if (serviceStatus === 'starting' && servicePort && serviceToken) {
      if (!waitForReady) {
        return { port: servicePort, token: serviceToken, status: 'starting' }
      }
      const healthy = await waitForHealth(servicePort)
      if (!healthy) {
        setServiceStatus('error')
        setServiceError('service_start_failed')
        throw new Error('service_start_failed')
      }
      setServiceStatus('ready')
      return { port: servicePort, token: serviceToken, status: 'running' }
    }
    setAutoConnectEnabled(true)
    setServiceStatus('connecting')
    setServiceError(null)
    const request = (async () => {
      try {
        const result = await connectNative()
        setServicePort(result.port)
        setServiceToken(result.token)
        if (result.status === 'running') {
          setServiceStatus('ready')
          return result
        }
        setServiceStatus('starting')
        if (!waitForReady) {
          return result
        }
        const healthy = await waitForHealth(result.port)
        if (!healthy) {
          setServiceStatus('error')
          setServiceError('service_start_failed')
          throw new Error('service_start_failed')
        }
        setServiceStatus('ready')
        return result
      } catch (error: any) {
        setServiceStatus('error')
        setServiceError(error.message || '本地服务不可用')
        throw error
      } finally {
        ensureInFlightRef.current = null
      }
    })()
    ensureInFlightRef.current = request
    return request
  }

  useEffect(() => {
    if (tourMode === 'auto') return
    if (!autoConnectEnabled) return
    if (serviceStatus !== 'idle') return
    ensureService(false).catch(() => undefined)
    return () => {
      if (sseRef.current) {
        sseRef.current.close()
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [tourMode, serviceStatus, autoConnectEnabled])

  useEffect(() => {
    if (serviceStatus !== 'ready') return
    if (!apiBase || !serviceToken || tourMode === 'auto') return
    refreshTasks()
    startSse()
    return () => {
      if (sseRef.current) {
        sseRef.current.close()
      }
    }
  }, [apiBase, serviceToken, tourMode, serviceStatus])

  useEffect(() => {
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current)
      statusPollRef.current = null
    }
    if ((serviceStatus !== 'ready' && serviceStatus !== 'starting') || !apiBase || !serviceToken || tourMode === 'auto') {
      setModelCached(null)
      setModelReady(null)
      setModelLoading(null)
      return
    }
    const poll = async () => {
      const data = await fetchServiceStatus()
      if (data?.modelReady) {
        if (statusPollRef.current) {
          window.clearInterval(statusPollRef.current)
          statusPollRef.current = null
        }
      }
    }
    const shouldPoll = serviceStatus === 'starting' || modelLoading === true
    if (!shouldPoll) {
      if (modelCached === null) {
        poll()
      }
      return
    }
    poll()
    statusPollRef.current = window.setInterval(poll, 10000)
    return () => {
      if (statusPollRef.current) {
        window.clearInterval(statusPollRef.current)
        statusPollRef.current = null
      }
    }
  }, [serviceStatus, apiBase, serviceToken, tourMode, modelLoading, modelCached])

  useEffect(() => {
    if (healthPollRef.current) {
      window.clearInterval(healthPollRef.current)
      healthPollRef.current = null
    }
    if (serviceStatus !== 'starting' || !servicePort || tourMode === 'auto') {
      return
    }
    const start = Date.now()
    healthPollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${servicePort}/health`)
        if (response.ok) {
          window.clearInterval(healthPollRef.current!)
          healthPollRef.current = null
          setServiceStatus('ready')
          return
        }
      } catch {
        // ignore
      }
      if (Date.now() - start > 60000) {
        window.clearInterval(healthPollRef.current!)
        healthPollRef.current = null
        setServiceStatus('error')
        setServiceError('service_start_failed')
      }
    }, 1000)
    return () => {
      if (healthPollRef.current) {
        window.clearInterval(healthPollRef.current)
        healthPollRef.current = null
      }
    }
  }, [serviceStatus, servicePort, tourMode])

  useEffect(() => {
    if (!overlayLockedRef.current) return
    if (serviceStatus === 'error') {
      hideOverlay(0)
      return
    }
    if (serviceStatus !== 'ready' && serviceStatus !== 'starting') {
      setOverlayVisible(true)
      setOverlayHiding(false)
      return
    }
    if (modelCached === null) return
    const elapsed = Date.now() - overlayStartRef.current
    const delayMs = modelCached ? 0 : Math.max(0, 10000 - elapsed)
    hideOverlay(delayMs)
  }, [serviceStatus, modelCached])

  useEffect(() => {
    const inProgress = tasks.filter((task) =>
      ['queued', 'downloading', 'transcribing'].includes(task.status)
    ).length
    if (!chrome?.action?.setBadgeText) return
    const badgeText = inProgress > 99 ? '99+' : inProgress ? String(inProgress) : ''
    chrome.action.setBadgeText({ text: badgeText })
    chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' })
  }, [tasks])

  const getActiveTab = () => {
    return new Promise<chrome.tabs.Tab>((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        const tab = tabs[0]
        if (!tab) {
          reject(new Error('未找到当前标签页'))
          return
        }
        resolve(tab)
      })
    })
  }

  const getSiteFromUrl = (url: string) => {
    try {
      const { hostname } = new URL(url)
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube'
      if (hostname.includes('bilibili.com')) return 'bilibili'
      return 'other'
    } catch {
      return 'other'
    }
  }

  const collectCookies = (url: string) => {
    const { hostname } = new URL(url)
    const domain = hostname.includes('youtube.com')
      ? 'youtube.com'
      : hostname.includes('bilibili.com')
        ? 'bilibili.com'
        : hostname
    return new Promise<chrome.cookies.Cookie[]>((resolve, reject) => {
      chrome.cookies.getAll({ domain }, (cookies) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve(cookies)
      })
    })
  }

  const closeToast = (id: string) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, closing: true } : toast)))
    const timers = toastTimersRef.current.get(id) || []
    timers.forEach((timer) => window.clearTimeout(timer))
    const removeTimer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
      toastTimersRef.current.delete(id)
    }, 500)
    toastTimersRef.current.set(id, [removeTimer])
  }

  const showToast = (kind: ToastKind, message: string, duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, kind, message, closing: false, duration }])
    const exitTimer = window.setTimeout(() => closeToast(id), duration)
    toastTimersRef.current.set(id, [exitTimer])
  }

  const hideOverlay = (delayMs = 0) => {
    if (overlayTimerRef.current) {
      window.clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }
    const run = () => {
      setOverlayHiding(true)
      window.setTimeout(() => {
        setOverlayVisible(false)
        overlayLockedRef.current = false
      }, 500)
    }
    if (delayMs <= 0) {
      run()
      return
    }
    overlayTimerRef.current = window.setTimeout(run, delayMs)
  }

  const guardTourAction = (message = '请先完成新手引导') => {
    if (tourMode !== 'auto') return false
    showToast('info', message)
    return true
  }

  const handleAddTask = async () => {
    if (guardTourAction()) return
    setIsAdding(true)
    try {
      if (serviceStatus !== 'ready') {
        await ensureService(true)
      }
      if (modelReady === false) {
        setModelLoading(true)
      }
      const tab = await getActiveTab()
      const url = tab.url || ''
      if (!url.startsWith('http')) {
        throw new Error('当前页面不支持转写')
      }
      const payload = {
        url,
        title: tab.title || '',
        site: getSiteFromUrl(url),
      }
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await refreshTasks()
    } catch (error: any) {
      showToast('error', error.message || '添加任务失败')
    } finally {
      setIsAdding(false)
    }
  }

  const handleCancel = (task: TaskItem) => {
    setPendingCancel(task)
  }

  const confirmCancel = async () => {
    if (guardTourAction()) {
      setPendingCancel(null)
      return
    }
    const task = pendingCancel
    if (!task) return
    setPendingCancel(null)
    try {
      await apiFetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
      await refreshTasks()
    } catch (error: any) {
      showToast('error', error.message || '取消失败')
    }
  }

  const handleRetry = async (task: TaskItem) => {
    if (guardTourAction()) return
    try {
      if (task.errorCode === 'cookies_required') {
        const cookies = await collectCookies(task.url)
        await apiFetch(`/api/tasks/${task.id}/cookies`, {
          method: 'POST',
          body: JSON.stringify(cookies),
        })
      }
      await apiFetch(`/api/tasks/${task.id}/retry`, { method: 'POST' })
      await refreshTasks()
    } catch (error: any) {
      showToast('error', error.message || '重试失败')
    }
  }

  const handleDelete = async (task: TaskItem) => {
    if (guardTourAction()) return
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      await refreshTasks()
    } catch (error: any) {
      showToast('error', error.message || '删除失败')
    }
  }

  const handleClearQueue = async () => {
    if (guardTourAction()) return
    try {
      await apiFetch('/api/tasks/clear', {
        method: 'POST',
        body: JSON.stringify({ include_done: false }),
      })
      await refreshTasks()
    } catch (error: any) {
      showToast('error', error.message || '清空队列失败')
    }
  }

  const handleLoadMore = () => {
    const nextCount = Math.min(filteredTasks.length, visibleCount + 5)
    setVisibleCount(nextCount)
  }

  const handleReconnect = async () => {
    if (guardTourAction()) return
    try {
      setAutoConnectEnabled(true)
      await ensureService(true)
    } catch (error: any) {
      if (error?.message === 'tour_active') return
      showToast('error', error?.message || '连接失败')
    }
  }

  const handleStopService = async () => {
    if (guardTourAction()) return
    try {
      await sendNative('shutdown')
      setServiceStatus('idle')
      setServiceError(null)
      setServicePort(null)
      setServiceToken(null)
      setSseStatus('connecting')
      setAutoConnectEnabled(false)
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
      }
      showToast('success', '已停止本地服务')
    } catch (error: any) {
      showToast('error', error?.message || '停止服务失败')
    }
  }

  const startTour = () => {
    setTourStep(0)
    setTourMode('manual')
  }

  const closeTour = () => {
    const wasAuto = tourMode === 'auto'
    setTourMode(null)
    setTourStep(0)
    if (wasAuto) {
      ensureService(false).catch(() => undefined)
    }
  }

  const prevTour = () => {
    setTourStep((prev) => Math.max(prev - 1, 0))
  }

  const nextTour = () => {
    if (tourStep >= tourSteps.length - 1) {
      closeTour()
      return
    }
    setTourStep((prev) => prev + 1)
  }

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

  const updateStepStatus = (id: string, status: DiagnosticStatus) => {
    setDiagnosticSteps((prev) => prev.map((step) => (step.id === id ? { ...step, status } : step)))
  }

  const finalizeDiagnostic = (ok: boolean, title: string, detail: string, actions: string[]) => {
    setDiagnosticResult({ ok, title, detail, actions })
    setDiagnosticStage('result')
    setProgressTarget(100)
  }

  const runDiagnostics = async () => {
    if (guardTourAction()) return
    const steps: DiagnosticStep[] = [
      { id: 'native', label: '检查 Native Host 连接', status: 'pending' },
      { id: 'service', label: '检查本地服务启动', status: 'pending' },
      { id: 'health', label: '检查服务健康状态', status: 'pending' },
      { id: 'token', label: '验证鉴权 Token', status: 'pending' },
    ]
    setDiagnosticRunId((prev) => prev + 1)
    setDiagnosticSteps(steps)
    setDiagnosticResult(null)
    setProgressValue(0)
    setProgressTarget(0)
    setDiagnosticStage('running')

    const totalSteps = steps.length
    let currentPort: number | null = null
    let currentToken: string | null = null

    try {
      updateStepStatus('native', 'running')
      await sleep(900)
      await sendNative('getStatus')
      updateStepStatus('native', 'done')
      setProgressTarget(Math.round((1 / totalSteps) * 100))

      updateStepStatus('service', 'running')
      await sleep(1100)
      const ensure = await sendNative('ensureRunning')
      currentPort = ensure.port
      currentToken = ensure.token
      updateStepStatus('service', 'done')
      setProgressTarget(Math.round((2 / totalSteps) * 100))

      updateStepStatus('health', 'running')
      await sleep(900)
      const health = await fetch(`http://127.0.0.1:${currentPort}/health`)
      if (!health.ok) {
        throw new Error('health_failed')
      }
      updateStepStatus('health', 'done')
      setProgressTarget(Math.round((3 / totalSteps) * 100))

      updateStepStatus('token', 'running')
      await sleep(1000)
      const auth = await fetch(`http://127.0.0.1:${currentPort}/api/tasks`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      if (auth.status === 401) {
        throw new Error('token_mismatch')
      }
      if (!auth.ok) {
        throw new Error('token_check_failed')
      }
      updateStepStatus('token', 'done')
      setProgressTarget(100)

      finalizeDiagnostic(true, '诊断通过', '本地服务与 Native Host 工作正常。', [
        '可以返回任务面板继续使用',
      ])
    } catch (error: any) {
      const message = error?.message || '诊断失败'
      if (message === 'native_error' || message.includes('Native host')) {
        updateStepStatus('native', 'fail')
        finalizeDiagnostic(false, 'Native Host 未连接', '无法与本地伴随程序建立连接。', [
          '确认已执行安装脚本并填写正确扩展 ID',
          '检查 manifest path 是否指向 host-macos.sh',
          '确认脚本具备可执行权限',
        ])
        return
      }
      if (message === 'service_start_failed' || message === 'health_failed') {
        updateStepStatus('service', 'fail')
        finalizeDiagnostic(false, '本地服务启动失败', '服务未能成功启动或健康检查失败。', [
          '确认端口未被占用（默认 8001）',
          '确认 Python 环境与依赖已安装',
          '查看 native-host.log 获取启动信息',
        ])
        return
      }
      if (message === 'token_mismatch' || message === 'token_missing') {
        updateStepStatus('token', 'fail')
        finalizeDiagnostic(false, 'Token 校验失败', '服务已启动，但鉴权 token 不一致。', [
          '删除 service.token 后重启服务',
          '确认 host 与服务使用同一 token 路径',
        ])
        return
      }
      updateStepStatus('health', 'fail')
      finalizeDiagnostic(false, '诊断未通过', '未能完成全部检查步骤。', [
        '查看 native-host.log 获取详细信息',
        '尝试重新连接或重启服务',
      ])
    }
  }

  const handleDownload = (task: TaskItem) => {
    if (guardTourAction()) return
    if (!apiBase || !serviceToken) return
    const url = `${apiBase}/api/tasks/${task.id}/result?token=${encodeURIComponent(serviceToken)}`
    chrome.downloads.download({
      url,
      filename: task.resultFilename || `transcription-${task.id}.txt`,
      conflictAction: 'uniquify',
    })
  }

  const statusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'queued':
        return '等待中'
      case 'downloading':
        return '下载中'
      case 'transcribing':
        return '转写中'
      case 'done':
        return '已完成'
      case 'error':
        return '失败'
      case 'canceled':
        return '已取消'
      default:
        return status
    }
  }

  const statusTone = (status: TaskStatus) => {
    switch (status) {
      case 'done':
        return 'text-emerald-600 bg-emerald-50 border-emerald-100'
      case 'error':
        return 'text-rose-600 bg-rose-50 border-rose-100'
      case 'canceled':
        return 'text-slate-500 bg-slate-100 border-slate-200'
      case 'downloading':
      case 'transcribing':
        return 'text-indigo-600 bg-indigo-50 border-indigo-100'
      default:
        return 'text-slate-500 bg-white border-slate-200'
    }
  }

  const activeTour = tourSteps[tourStep]
  const isFirstTourStep = tourStep === 0
  const isLastTourStep = tourStep === tourSteps.length - 1

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden select-none relative">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[80px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-200/50 rounded-full blur-[80px]" />
      </div>

      <header className="px-6 py-5 bg-white/70 backdrop-blur-xl border-b border-white/40 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-slate-800">转写任务面板</h1>
          <p className="text-[11px] text-indigo-500 font-black tracking-widest uppercase">Local Queue</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startTour}
            className="rounded-full border border-indigo-100 px-3 py-1 text-[10px] font-bold text-indigo-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:text-indigo-600"
          >
            新手引导
          </button>
          <button
            ref={serviceBadgeRef}
            onClick={
              serviceStatus === 'ready'
                ? handleStopService
                : serviceStatus === 'error'
                  ? handleReconnect
                  : undefined
            }
            disabled={serviceStatus === 'connecting' || serviceStatus === 'starting'}
            className={`inline-flex items-center gap-1 rounded-2xl px-3 py-1.5 text-[10px] font-black tracking-wider shadow-sm border transition-all duration-200 ${
              serviceStatus === 'ready'
                ? 'bg-white text-emerald-600 border-emerald-100 hover:-translate-y-0.5 hover:shadow-sm'
                : serviceStatus === 'connecting' || serviceStatus === 'starting'
                  ? 'bg-white text-indigo-500 border-indigo-100'
                  : 'bg-white text-rose-500 border-rose-100 hover:-translate-y-0.5 hover:shadow-sm'
            }`}
          >
            {serviceStatus === 'ready' && <Power size={12} />}
            {serviceStatus === 'ready'
              ? '服务已连接 · 停止'
              : serviceStatus === 'starting'
                ? '启动中'
                : serviceStatus === 'connecting'
                  ? '连接中'
                  : '服务未连接 · 重试'}
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-6 relative z-10">
        {(serviceStatus === 'ready' || serviceStatus === 'starting') && modelLoading && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-4 py-2 text-xs font-semibold text-indigo-600 shadow-sm">
            <ArrowClockwise size={12} className="animate-spin" />
            模型加载中
          </div>
        )}
        {(serviceStatus === 'error' || diagnosticStage !== 'idle') && (
          <div className="mb-6 rounded-[24px] bg-slate-50 p-5 shadow-sm list-entry">
            {diagnosticStage === 'idle' && (
              <div className="flex flex-col items-center justify-center text-center">
                <div className="text-sm font-semibold text-slate-700">诊断工具</div>
                <p className="mt-1 text-xs text-slate-400">
                  一键检查本地伴随程序与服务状态，定位问题原因。
                </p>
                {serviceStatus === 'error' && (
                  <div className="mt-3 flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[11px] text-rose-500">
                    <WarningCircle size={12} />
                    <span className="font-semibold">本地服务未就绪</span>
                    <span className="text-rose-400">
                      {serviceError || '请检查本地服务与 Native Host 安装。'}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={runDiagnostics}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-white text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  开始诊断
                </button>
                {serviceStatus === 'error' && (
                  <button
                    onClick={handleReconnect}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-rose-500 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <ArrowClockwise size={14} />
                    重新连接
                  </button>
                )}
                </div>
              </div>
            )}

            {diagnosticStage === 'running' && (
              <div className="flex gap-5">
                <div className="relative h-24 w-24 shrink-0">
                  {(() => {
                    const radius = 36
                    const circumference = 2 * Math.PI * radius
                    const offset = circumference - (progressValue / 100) * circumference
                    return (
                      <svg width="96" height="96" className="block">
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          stroke="#E2E8F0"
                          strokeWidth="8"
                          fill="none"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          stroke="#4F46E5"
                          strokeWidth="8"
                          strokeDasharray={`${circumference} ${circumference}`}
                          strokeDashoffset={offset}
                          fill="none"
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                        />
                      </svg>
                    )
                  })()}
                  <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-slate-700">
                    {progressValue}%
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {diagnosticSteps
                    .filter((step) => step.status !== 'pending')
                    .map((step) => (
                      <div
                        key={`${diagnosticRunId}-${step.id}`}
                        className="diag-log flex items-center gap-2 text-xs"
                      >
                        {step.status === 'running' && <span className="diag-dot" />}
                        {step.status === 'done' && (
                          <CheckCircle size={14} className="diag-check text-emerald-500" />
                        )}
                        {step.status === 'fail' && (
                          <WarningCircle size={14} className="text-rose-500" />
                        )}
                        <span
                          className={`${
                            step.status === 'done' ? 'text-slate-400' : 'text-slate-600'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {diagnosticStage === 'result' && diagnosticResult && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CheckCircle
                    size={16}
                    className={diagnosticResult.ok ? 'text-emerald-500' : 'text-rose-500'}
                  />
                  {diagnosticResult.title}
                </div>
                <p className="text-xs text-slate-500">{diagnosticResult.detail}</p>
                {diagnosticResult.actions.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-slate-400">
                    {diagnosticResult.actions.map((action) => (
                      <li key={action}>• {action}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setDiagnosticStage('idle')}
                  className="mt-2 inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  返回
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-5">
          <button
            onClick={handleAddTask}
            disabled={serviceStatus !== 'ready' || isAdding}
            ref={createButtonRef}
            className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-white text-sm font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-indigo-600/40"
          >
            {isAdding ? <ArrowClockwise size={16} className="animate-spin" /> : <Plus size={16} />}
            创建转写任务
          </button>
          <button
            onClick={handleClearQueue}
            ref={clearQueueRef}
            className="text-xs font-bold text-slate-500 transition-all duration-200 hover:text-slate-700 hover:-translate-y-0.5"
          >
            清空队列
          </button>
        </div>

        <div className="rounded-[18px] bg-[#F5F7FA] px-2 py-2">
          <div className="flex items-stretch text-xs font-semibold">
          {(
            [
              { key: 'active', label: '进行中', value: taskStats.inProgress },
              { key: 'done', label: '已完成', value: taskStats.done },
            ] as const
          ).map((item, index, arr) => (
            <React.Fragment key={item.key}>
              <button
                onClick={() => setFilter(item.key)}
                className={`flex-1 rounded-[14px] px-2 py-2 text-[11px] transition-all duration-200 ${
                  filter === item.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-800">
                  {item.label}
                  <span className="text-slate-400">({item.value})</span>
                </div>
              </button>
              {index < arr.length - 1 && (
                <div className="flex items-center">
                  <div className="h-[60%] w-px bg-slate-200/70" />
                </div>
              )}
            </React.Fragment>
          ))}
          </div>
        </div>


        <div ref={listAreaRef} className="space-y-4 pb-6">
          {serviceStatus === 'ready' && !hasSnapshot && (
            <>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="rounded-3xl border border-white bg-white/80 p-5 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="skeleton h-4 w-3/4 rounded-full" />
                    <div className="skeleton h-3 w-1/2 rounded-full" />
                  </div>
                  <div className="mt-5 space-y-4">
                    <div className="skeleton h-2 w-full rounded-full" />
                    <div className="skeleton h-2 w-4/5 rounded-full" />
                  </div>
                </div>
              ))}
            </>
          )}
          {serviceStatus === 'ready' && hasSnapshot && filteredTasks.length === 0 && (
            <div className="rounded-3xl border border-white bg-white/70 p-8 text-center text-slate-400 text-sm">
              暂无任务，打开视频页面后点击“创建转写任务”。
            </div>
          )}
          {serviceStatus === 'ready' &&
            hasSnapshot &&
            visibleTasks.map((task, index) => {
            const isActive =
              task.status === 'queued' ||
              task.status === 'downloading' ||
              task.status === 'transcribing'
            const isCurrent =
              activeTaskId === task.id ||
              (!activeTaskId && (task.status === 'downloading' || task.status === 'transcribing'))
            const isWaiting = task.status === 'queued' && !isCurrent
            const downloadDone = task.downloadProgress >= 100
            const transcribeDone = task.transcribeProgress >= 100
            return (
              <div
                key={`${task.id}-${animateKey}`}
                className={`task-card list-entry relative rounded-3xl border border-white bg-white/80 p-5 shadow-sm ${
                  isCurrent ? 'ring-2 ring-indigo-200 shadow-md' : ''
                } ${isWaiting ? 'opacity-60' : ''}`}
                style={{ animationDelay: `${0.05 + index * 0.07}s` }}
              >
                {isActive && (
                  <button
                    onClick={() => handleCancel(task)}
                    className="absolute left-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-600"
                    title="取消任务"
                  >
                    <X size={10} />
                  </button>
                )}

                <div
                  className={`absolute right-4 top-4 px-2.5 py-1 rounded-full text-[10px] font-black border ${statusTone(task.status)}`}
                >
                  {statusBadge(task.status)}
                </div>

                <div className={`min-w-0 ${isActive ? 'pl-8' : ''} pr-16`}>
                  <p className="text-sm font-semibold text-slate-800 leading-snug break-words">
                    {task.title || task.url}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 break-all">{task.url}</p>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {downloadDone ? (
                          <CheckCircle size={12} className="text-emerald-500" />
                        ) : (
                          <ArrowClockwise size={12} className="animate-spin text-indigo-500" />
                        )}
                        下载进度
                      </span>
                      <span>{task.downloadProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${task.downloadProgress}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                      {transcribeDone ? (
                        <CheckCircle size={12} className="text-emerald-500" />
                      ) : task.status === 'transcribing' ? (
                        <ArrowClockwise size={12} className="animate-spin text-amber-500" />
                      ) : (
                        <Clock size={12} className="text-slate-400" />
                      )}
                        转写进度
                      </span>
                    <span>{task.transcribeProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${task.transcribeProgress}%` }}
                    />
                  </div>
                  </div>
                </div>

                {task.status === 'queued' && task.queuePosition != null && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <Clock size={12} />
                    当前排队位置：{task.queuePosition}
                  </div>
                )}

                {task.status === 'error' && (
                  <div className="mt-3 text-xs text-rose-500">
                    {task.errorMessage || '任务失败'}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {(task.status === 'error' || task.status === 'canceled') && (
                    <button
                      onClick={() => handleRetry(task)}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-indigo-300"
                    >
                      <ArrowClockwise size={12} />
                      重试
                    </button>
                  )}

                  {task.status === 'done' && (
                    <button
                      onClick={() => handleDownload(task)}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-emerald-300"
                    >
                      <DownloadSimple size={12} />
                      下载 TXT
                    </button>
                  )}

                  {(task.status === 'done' ||
                    task.status === 'error' ||
                    task.status === 'canceled') && (
                    <button
                      onClick={() => handleDelete(task)}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-xs font-bold text-rose-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-rose-300"
                    >
                      <Trash size={12} />
                      删除
                    </button>
                  )}

                  {task.status === 'done' && (
                    <div className="inline-flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle size={12} />
                      已完成
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredTasks.length > visibleCount && (
          <button
            onClick={handleLoadMore}
            className="w-full rounded-2xl border border-indigo-100 bg-white/80 py-2 text-xs font-bold text-indigo-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            更多
          </button>
        )}
      </main>

      {overlayVisible && (
        <div className={`loading-overlay ${overlayHiding ? 'loading-overlay-exit' : ''}`}>
          <div className="loading-blob" />
          <div className="loading-text">启动中</div>
        </div>
      )}

      {tourMode && activeTour && (
        <div className="tour-layer">
          <div className="tour-overlay" style={{ clipPath: tourClipPath }} />
          <div
            className="tour-spotlight"
            style={{
              top: tourRect.top,
              left: tourRect.left,
              width: tourRect.width,
              height: tourRect.height,
            }}
          />
          <div
            className={`tour-bubble tour-${tourPlacement}`}
            style={{ top: tourBubblePos.top, left: tourBubblePos.left }}
          >
            <div key={activeTour.key} className="tour-bubble-inner">
              <span className={`tour-arrow tour-arrow-${tourPlacement}`} />
              <div className="tour-header">
                <div className="tour-title">{activeTour.title}</div>
                <button className="tour-skip" onClick={closeTour}>
                  跳过
                </button>
              </div>
              <div className="tour-content">{activeTour.content}</div>
              <div className="tour-footer">
                <span className="tour-step">
                  {tourStep + 1}/{tourSteps.length}
                </span>
                <div className="tour-actions">
                  <button
                    className="tour-btn tour-btn-ghost"
                    onClick={prevTour}
                    disabled={isFirstTourStep}
                  >
                    上一步
                  </button>
                  <button className="tour-btn tour-btn-primary" onClick={nextTour}>
                    {isLastTourStep ? '完成' : '下一步'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-item toast-${toast.kind} ${toast.closing ? 'toast-exit' : 'toast-enter'}`}
            style={{ '--toast-duration': `${toast.duration}ms` } as React.CSSProperties}
          >
            <div className="toast-body">
              {toast.kind === 'error' ? (
                <WarningCircle size={16} />
              ) : toast.kind === 'success' ? (
                <CheckCircle size={16} />
              ) : (
                <Clock size={16} />
              )}
              <span className="toast-text">{toast.message}</span>
              <button className="toast-close" onClick={() => closeToast(toast.id)}>
                <X size={12} />
              </button>
            </div>
            <div className="toast-progress" />
          </div>
        ))}
      </div>

      {pendingCancel && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setPendingCancel(null)}
        >
          <div
            className="w-[90%] max-w-sm rounded-3xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <WarningCircle size={16} className="text-rose-500" />
              确认取消任务？
            </div>
            <p className="mt-2 text-xs text-slate-500 break-words">
              {pendingCancel.title || pendingCancel.url}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingCancel(null)}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                返回
              </button>
              <button
                onClick={confirmCancel}
                className="inline-flex items-center justify-center rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-600 hover:shadow-md"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
