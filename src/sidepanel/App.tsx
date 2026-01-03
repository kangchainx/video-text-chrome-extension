import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmModal from './ConfirmModal'
import {
  ArrowClockwise,
  CheckCircle,
  CloudArrowDown,
  Copy,
  Download,
  DownloadSimple,
  FileText,
  Clock,
  Globe,
  Lightbulb,
  MagnifyingGlass,
  PauseCircle,
  PlayCircle,
  Plus,
  Power,
  Sparkle,
  Trash,
  WarningCircle,
  X,
  XCircle,
} from 'phosphor-react'

const NATIVE_HOST_NAME = 'com.video_text.transcriber'

// 错误码到 i18n 键的映射
const SERVICE_ERROR_KEYS: Record<string, string> = {
  service_start_failed: 'errors.serviceStartFailed',
  native_error: 'errors.nativeError',
  native_host_timeout: 'errors.nativeTimeout',
  token_mismatch: 'errors.tokenMismatch',
  connection_refused: 'errors.connectionRefused',
}

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
  const { t, i18n } = useTranslation()

  // 获取错误消息（使用 i18n）
  const getServiceErrorMessage = (error: string | null): string => {
    if (!error) return t('errors.checkNativeHost')
    if (SERVICE_ERROR_KEYS[error]) {
      return t(SERVICE_ERROR_KEYS[error])
    }
    // 对未知错误进行安全处理：截断并移除潜在的 HTML 标签
    const sanitized = error.replace(/<[^>]*>/g, '').slice(0, 100)
    return sanitized || t('errors.unknownError')
  }

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
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean
    title: string
    message: string
    description?: string
    onConfirm: () => void
    variant?: 'danger' | 'warning' | 'info'
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const sseRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const sseRetryCountRef = useRef(0)
  const statusPollRef = useRef<number | null>(null)
  const overlayTimerRef = useRef<number | null>(null)
  const overlayStartRef = useRef<number>(Date.now())
  const overlayLockedRef = useRef(true)
  const healthPollRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const toastTimersRef = useRef<Map<string, number[]>>(new Map())
  const ensureInFlightRef = useRef<Promise<{ port: number; token: string }> | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const serviceBadgeRef = useRef<HTMLButtonElement | null>(null)
  const createButtonRef = useRef<HTMLButtonElement | null>(null)
  const listAreaRef = useRef<HTMLDivElement | null>(null)
  const clearQueueRef = useRef<HTMLButtonElement | null>(null)

  const apiBase = useMemo(() => {
    if (!servicePort) return null
    return `http://127.0.0.1:${servicePort}`
  }, [servicePort])

  const tourSteps: TourStep[] = useMemo(
    () => [
      { key: 'status', title: t('tour.steps.status.title'), content: t('tour.steps.status.content') },
      { key: 'create', title: t('tour.steps.create.title'), content: t('tour.steps.create.content') },
      { key: 'list', title: t('tour.steps.list.title'), content: t('tour.steps.list.content') },
      { key: 'clear', title: t('tour.steps.clear.title'), content: t('tour.steps.clear.content') },
    ],
    [t]
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

  // 统一清理所有计时器和连接
  useEffect(() => {
    return () => {
      // 清理 toast 计时器
      toastTimersRef.current.forEach((timers) =>
        timers.forEach((timer) => window.clearTimeout(timer))
      )
      toastTimersRef.current.clear()

      // 清理 overlay 计时器
      if (overlayTimerRef.current) {
        window.clearTimeout(overlayTimerRef.current)
        overlayTimerRef.current = null
      }

      // 清理状态轮询
      if (statusPollRef.current) {
        window.clearInterval(statusPollRef.current)
        statusPollRef.current = null
      }

      // 清理健康检查轮询
      if (healthPollRef.current) {
        window.clearInterval(healthPollRef.current)
        healthPollRef.current = null
      }

      // 清理 SSE 重连计时器
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      // 关闭 SSE 连接
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
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

  const NATIVE_TIMEOUT_MS = 30000

  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        window.setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ])
  }

  const connectNative = () => {
    const request = new Promise<{ port: number; token: string; status?: string }>((resolve, reject) => {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { type: 'ensureRunning' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          if (!response?.ok) {
            reject(new Error(response?.error || 'cannot_connect'))
            return
          }
          resolve({ port: response.port, token: response.token, status: response.status })
        }
      )
    })
    return withTimeout(request, NATIVE_TIMEOUT_MS, 'native_host_timeout')
  }

  const sendNative = (type: 'getStatus' | 'ensureRunning' | 'shutdown') => {
    const request = new Promise<any>((resolve, reject) => {
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
    return withTimeout(request, NATIVE_TIMEOUT_MS, 'service_timeout')
  }

  const API_TIMEOUT_MS = 15000

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    if (!apiBase || !serviceToken) {
      throw new Error('service_not_connected')
    }
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)

    try {
      const headers = new Headers(options.headers)
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      headers.set('Authorization', `Bearer ${serviceToken}`)
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || 'request_failed')
      }
      return response
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('request_timeout')
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  const refreshTasks = async () => {
    try {
      const response = await apiFetch('/api/tasks')
      const data = (await response.json()) as TasksSnapshot
      setTasks(data.tasks)
      setActiveTaskId(data.activeTaskId)
      setHasSnapshot(true)
    } catch (error: any) {
      console.error(error)
      // Only show toast for non-timeout errors to avoid duplicate notifications
      if (error.message !== 'request_timeout') {
        showToast('error', t('errors.refreshTasksFailed'))
      }
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
      // 出错时设为 null 表示状态未知，而不是 false/true
      setModelCached(null)
      setModelReady(null)
      setModelLoading(null)
      return null
    }
  }

  const HEALTH_CHECK_TIMEOUT_MS = 5000

  const waitForHealth = async (port: number, timeoutMs = 60000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)

      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: controller.signal,
        })
        if (response.ok) {
          return true
        }
      } catch (error) {
        // ignore - 服务可能还在启动中
      } finally {
        window.clearTimeout(timeoutId)
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }
    return false
  }

  const SSE_MAX_RETRIES = 5
  const SSE_BASE_DELAY = 1000

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
        sseRetryCountRef.current = 0 // 连接成功，重置重试计数
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

      sseRetryCountRef.current += 1

      if (sseRetryCountRef.current > SSE_MAX_RETRIES) {
        showToast('error', t('errors.sseReconnectFailed'))
        return
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = SSE_BASE_DELAY * Math.pow(2, sseRetryCountRef.current - 1)
      reconnectTimerRef.current = window.setTimeout(() => {
        startSse()
      }, delay)
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
        setServiceError(error.message || 'service_unavailable')
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
    sseRetryCountRef.current = 0 // 新连接时重置重试计数
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
          reject(new Error('tab_not_found'))
          return
        }
        resolve(tab)
      })
    })
  }

  // 使用精确的 hostname 匹配，避免 evil-youtube.com 等域名绕过
  const ALLOWED_HOSTS: Record<string, string> = {
    'youtube.com': 'youtube',
    'www.youtube.com': 'youtube',
    'm.youtube.com': 'youtube',
    'youtu.be': 'youtube',
    'bilibili.com': 'bilibili',
    'www.bilibili.com': 'bilibili',
    'm.bilibili.com': 'bilibili',
  }

  const getSiteFromUrl = (url: string) => {
    try {
      const { hostname } = new URL(url)
      return ALLOWED_HOSTS[hostname] || 'other'
    } catch {
      return 'other'
    }
  }

  // hostname 到 cookie 域名的映射
  const COOKIE_DOMAINS: Record<string, string> = {
    'youtube.com': 'youtube.com',
    'www.youtube.com': 'youtube.com',
    'm.youtube.com': 'youtube.com',
    'youtu.be': 'youtube.com',
    'bilibili.com': 'bilibili.com',
    'www.bilibili.com': 'bilibili.com',
    'm.bilibili.com': 'bilibili.com',
  }

  const collectCookies = (url: string) => {
    const { hostname } = new URL(url)
    const domain = COOKIE_DOMAINS[hostname] || hostname
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

  const guardTourAction = () => {
    if (tourMode !== 'auto') return false
    showToast('info', t('tour.completeFirst'))
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
        throw new Error(t('errors.pageNotSupported'))
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
      showToast('error', error.message || t('errors.addTaskFailed'))
    } finally {
      setIsAdding(false)
    }
  }

  const handleCancel = (task: TaskItem) => {
    setConfirmModalConfig({
      isOpen: true,
      title: t('modal.cancelTask.title'),
      message: t('modal.cancelTask.message'),
      description: task.title || task.url,
      onConfirm: async () => {
        await confirmCancel(task)
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))
      },
      variant: 'warning',
    })
  }

  const confirmCancel = async (task: TaskItem) => {
    if (guardTourAction()) return
    try {
      await apiFetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
      await refreshTasks()
      showToast('info', t('task.canceled'))
    } catch (error: any) {
      showToast('error', error.message || t('errors.cancelTaskFailed'))
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
      showToast('error', error.message || t('errors.retryFailed'))
    }
  }

  const handleDelete = async (task: TaskItem) => {
    if (guardTourAction()) return
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      await refreshTasks()
    } catch (error: any) {
      showToast('error', error.message || t('errors.deleteFailed'))
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
      showToast('error', error.message || t('errors.clearQueueFailed'))
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
      showToast('error', error?.message || t('errors.connectFailed'))
    }
  }

  const handleStopService = async () => {
    if (guardTourAction()) return
    setConfirmModalConfig({
      isOpen: true,
      title: t('modal.stopService.title'),
      message: t('modal.stopService.message'),
      description: t('modal.stopService.description'),
      onConfirm: async () => {
        await confirmStopService()
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))
      },
      variant: 'danger',
    })
  }

  const confirmStopService = async () => {
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
      showToast('success', t('toast.serviceStopped'))
    } catch (error: any) {
      showToast('error', error?.message || t('errors.stopServiceFailed'))
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

  // 最小延迟，仅用于让用户看到步骤切换
  const UI_STEP_DELAY = 100

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
      { id: 'native', label: t('diagnostic.steps.native'), status: 'pending' },
      { id: 'service', label: t('diagnostic.steps.service'), status: 'pending' },
      { id: 'health', label: t('diagnostic.steps.health'), status: 'pending' },
      { id: 'token', label: t('diagnostic.steps.token'), status: 'pending' },
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
      await sendNative('getStatus')
      updateStepStatus('native', 'done')
      setProgressTarget(Math.round((1 / totalSteps) * 100))
      await new Promise((r) => setTimeout(r, UI_STEP_DELAY))

      updateStepStatus('service', 'running')
      const ensure = await sendNative('ensureRunning')
      currentPort = ensure.port
      currentToken = ensure.token
      updateStepStatus('service', 'done')
      setProgressTarget(Math.round((2 / totalSteps) * 100))
      await new Promise((r) => setTimeout(r, UI_STEP_DELAY))

      updateStepStatus('health', 'running')
      const health = await fetch(`http://127.0.0.1:${currentPort}/health`)
      if (!health.ok) {
        throw new Error('health_failed')
      }
      updateStepStatus('health', 'done')
      setProgressTarget(Math.round((3 / totalSteps) * 100))
      await new Promise((r) => setTimeout(r, UI_STEP_DELAY))

      updateStepStatus('token', 'running')
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

      finalizeDiagnostic(
        true,
        t('diagnostic.results.passed.title'),
        t('diagnostic.results.passed.detail'),
        [t('diagnostic.results.passed.action')]
      )
    } catch (error: any) {
      const message = error?.message || 'unknown'
      if (message === 'native_error' || message.includes('Native host')) {
        updateStepStatus('native', 'fail')
        finalizeDiagnostic(
          false,
          t('diagnostic.results.nativeFailed.title'),
          t('diagnostic.results.nativeFailed.detail'),
          t('diagnostic.results.nativeFailed.actions', { returnObjects: true }) as string[]
        )
        return
      }
      if (message === 'service_start_failed' || message === 'health_failed') {
        updateStepStatus('service', 'fail')
        finalizeDiagnostic(
          false,
          t('diagnostic.results.serviceFailed.title'),
          t('diagnostic.results.serviceFailed.detail'),
          t('diagnostic.results.serviceFailed.actions', { returnObjects: true }) as string[]
        )
        return
      }
      if (message === 'token_mismatch' || message === 'token_missing') {
        updateStepStatus('token', 'fail')
        finalizeDiagnostic(
          false,
          t('diagnostic.results.tokenFailed.title'),
          t('diagnostic.results.tokenFailed.detail'),
          t('diagnostic.results.tokenFailed.actions', { returnObjects: true }) as string[]
        )
        return
      }
      updateStepStatus('health', 'fail')
      finalizeDiagnostic(
        false,
        t('diagnostic.results.unknownFailed.title'),
        t('diagnostic.results.unknownFailed.detail'),
        t('diagnostic.results.unknownFailed.actions', { returnObjects: true }) as string[]
      )
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
    return t(`task.status.${status}`)
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
          <h1 className="text-base font-extrabold tracking-tight text-slate-800">{t('app.title')}</h1>
          <p className="text-[11px] text-indigo-500 font-black tracking-widest uppercase">{t('app.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newLang = i18n.language === 'zh' ? 'en' : 'zh'
              i18n.changeLanguage(newLang)
            }}
            className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:text-slate-800 hover:border-slate-300"
            title={t('language.' + (i18n.language === 'zh' ? 'en' : 'zh'))}
          >
            <Globe size={12} className="inline mr-1" />
            {i18n.language === 'zh' ? 'EN' : '中文'}
          </button>
          <button
            onClick={startTour}
            className="rounded-full border border-indigo-100 px-3 py-1 text-[10px] font-bold text-indigo-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:text-indigo-600"
          >
            {t('tour.guide')}
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
                ? 'service-button-ready bg-white text-emerald-600 border-emerald-100 min-w-[100px] justify-center'
                : serviceStatus === 'connecting' || serviceStatus === 'starting'
                ? 'bg-white text-indigo-500 border-indigo-100'
                : 'bg-white text-rose-500 border-rose-100 hover:-translate-y-0.5 hover:shadow-sm'
            }`}
          >
            {serviceStatus === 'ready' && <Power size={12} />}
            {serviceStatus === 'error'
              ? t('service.notConnected')
              : serviceStatus === 'idle' || serviceStatus === 'connecting'
              ? t('service.connecting')
              : serviceStatus === 'starting'
              ? modelLoading === true
                ? t('service.modelLoading')
                : t('service.starting')
              : modelLoading === true
              ? t('service.modelLoading')
              : (
                <>
                  <span className="button-text-default">{t('service.connected')}</span>
                  <span className="button-text-hover">{t('service.stop')}</span>
                </>
              )}
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-6 relative z-10">
        {(serviceStatus === 'ready' || serviceStatus === 'starting') && modelLoading && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-4 py-2 text-xs font-semibold text-indigo-600 shadow-sm">
            <ArrowClockwise size={12} className="animate-spin" />
            {t('service.modelLoading')}
          </div>
        )}
        {(serviceStatus === 'error' || diagnosticStage !== 'idle') && (
          <div className="mb-6 rounded-[24px] bg-slate-50 p-5 shadow-sm list-entry">
            {diagnosticStage === 'idle' && (
              <div className="flex flex-col items-center justify-center text-center">
                <div className="text-sm font-semibold text-slate-700">{t('diagnostic.title')}</div>
                <p className="mt-1 text-xs text-slate-400">
                  {t('diagnostic.description')}
                </p>
                {serviceStatus === 'error' && (
                  <div className="mt-3 flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[11px] text-rose-500">
                    <WarningCircle size={12} />
                    <span className="font-semibold">{t('service.notReady')}</span>
                    <span className="text-rose-400">
                      {getServiceErrorMessage(serviceError)}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={runDiagnostics}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-white text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  {t('diagnostic.start')}
                </button>
                {serviceStatus === 'error' && (
                  <button
                    onClick={handleReconnect}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-rose-500 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <ArrowClockwise size={14} />
                    {t('diagnostic.reconnect')}
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
                  {t('diagnostic.back')}
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
            {t('task.create')}
          </button>
          <button
            onClick={handleClearQueue}
            ref={clearQueueRef}
            className="text-xs font-bold text-slate-500 transition-all duration-200 hover:text-slate-700 hover:-translate-y-0.5"
          >
            {t('task.clearQueue')}
          </button>
        </div>

        <div className="rounded-[18px] bg-[#F5F7FA] px-2 py-2">
          <div className="flex items-stretch text-xs font-semibold">
          {(
            [
              { key: 'active', label: t('task.inProgress'), value: taskStats.inProgress },
              { key: 'done', label: t('task.completed'), value: taskStats.done },
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
              {t('task.noTasks')}
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
                className={`task-card list-entry group relative rounded-3xl border border-white bg-white/80 p-5 shadow-sm ${
                  isCurrent ? 'ring-2 ring-indigo-200 shadow-md' : ''
                } ${isWaiting ? 'opacity-60' : ''}`}
                style={{ animationDelay: `${0.05 + index * 0.07}s` }}
              >
                {isActive && (
                  <button
                    onClick={() => handleCancel(task)}
                    className="absolute top-3 right-3 p-2 z-30 text-slate-300 opacity-100 sm:opacity-0 group-hover:opacity-100 group-hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all duration-300 hover:scale-110"
                    title={t('modal.cancelTask.title')}
                  >
                    <Trash size={16} />
                  </button>
                )}


                <div className="min-w-0 pr-12">
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
                        {t('task.downloadProgress')}
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
                        {t('task.transcribeProgress')}
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
                    {t('task.queuePosition')}: {task.queuePosition}
                  </div>
                )}

                {task.status === 'error' && (
                  <div className="mt-3 text-xs text-rose-500">
                    {task.errorMessage || t('task.failed')}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {(task.status === 'error' || task.status === 'canceled') && (
                    <button
                      onClick={() => handleRetry(task)}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-indigo-300"
                    >
                      <ArrowClockwise size={12} />
                      {t('task.retry')}
                    </button>
                  )}

                  {task.status === 'done' && (
                    <button
                      onClick={() => handleDownload(task)}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm hover:border-emerald-300"
                    >
                      <DownloadSimple size={12} />
                      {t('task.downloadTxt')}
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
                      {t('task.delete')}
                    </button>
                  )}

                  {task.status === 'done' && (
                    <div className="inline-flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle size={12} />
                      {t('task.status.done')}
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
            {t('task.loadMore')}
          </button>
        )}
      </main>

      {overlayVisible && (
        <div className={`loading-overlay ${overlayHiding ? 'loading-overlay-exit' : ''}`}>
          <div className="loading-blob" />
          <div className="loading-text">{t('service.starting')}</div>
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
                  {t('tour.skip')}
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
                    {t('tour.prev')}
                  </button>
                  <button className="tour-btn tour-btn-primary" onClick={nextTour}>
                    {isLastTourStep ? t('tour.finish') : t('tour.next')}
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

      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        onClose={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalConfig.onConfirm}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        description={confirmModalConfig.description}
        variant={confirmModalConfig.variant}
      />
    </div>
  )
}

export default App
