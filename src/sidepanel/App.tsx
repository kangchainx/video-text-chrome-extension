import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmModal from './ConfirmModal'
import {
  ArrowClockwise,
  CheckCircle,
  ClockCounterClockwise,
  Activity,
  CloudArrowDown,
  Copy,
  Download,
  DownloadSimple,
  FileText,
  Clock,
  Globe,
  Lightbulb,
  Link,
  Stack,      // Replaced Layers
  CircleNotch,// Replaced Loader
  MagnifyingGlass,
  Megaphone,
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

type TaskStatus = 'queued' | 'downloading' | 'transcribing' | 'canceling' | 'done' | 'error' | 'canceled'

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

type TaskView = TaskItem & { displayStatus: TaskStatus }

const IN_PROGRESS_STATUSES: TaskStatus[] = ['queued', 'downloading', 'transcribing']

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
  const [optimisticCanceledIds, setOptimisticCanceledIds] = useState<Set<string>>(() => new Set())
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
  const [animateActiveCount, setAnimateActiveCount] = useState(false)
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
      { key: 'status', title: t('tour.steps.status.title'), content: t('tour.steps.status.content') },
      { key: 'create', title: t('tour.steps.create.title'), content: t('tour.steps.create.content') },
      { key: 'list', title: t('tour.steps.list.title'), content: t('tour.steps.list.content') },
    ],
    [t]
  )

  const tasksWithDisplay = useMemo<TaskView[]>(() => {
    if (optimisticCanceledIds.size === 0) {
      return tasks.map((task) => ({ ...task, displayStatus: task.status }))
    }
    return tasks.map((task) => {
      const shouldOverride =
        optimisticCanceledIds.has(task.id) && IN_PROGRESS_STATUSES.includes(task.status)
      return { ...task, displayStatus: shouldOverride ? 'canceled' : task.status }
    })
  }, [tasks, optimisticCanceledIds])

  const taskStats = useMemo(() => {
    const inProgress = tasksWithDisplay.filter((task) =>
      IN_PROGRESS_STATUSES.includes(task.displayStatus)
    ).length
    const done = tasksWithDisplay.filter((task) =>
      ['done', 'canceled', 'error'].includes(task.displayStatus)
    ).length
    return { inProgress, done }
  }, [tasksWithDisplay])

  const filteredTasks = useMemo(() => {
    if (filter === 'active') {
      return tasksWithDisplay.filter((task) =>
        IN_PROGRESS_STATUSES.includes(task.displayStatus)
      )
    }
    if (filter === 'done') {
      const completed = tasksWithDisplay.filter((task) =>
        ['done', 'canceled', 'error'].includes(task.displayStatus)
      )
      completed.sort((a, b) => b.createdAt - a.createdAt)
      return completed
    }
    const active = tasksWithDisplay.filter((task) =>
      IN_PROGRESS_STATUSES.includes(task.displayStatus)
    )
    active.sort((a, b) => b.createdAt - a.createdAt)
    return active
  }, [tasksWithDisplay, filter])

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
    if (optimisticCanceledIds.size === 0) return
    setOptimisticCanceledIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      let changed = false
      const tasksById = new Map(tasks.map((task) => [task.id, task]))
      for (const id of prev) {
        const task = tasksById.get(id)
        if (!task || ['done', 'error', 'canceled'].includes(task.status)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [tasks, optimisticCanceledIds.size])

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
    if (taskStats.inProgress > 0) {
      setAnimateActiveCount(true)
      const timer = setTimeout(() => setAnimateActiveCount(false), 400)
      return () => clearTimeout(timer)
    }
  }, [taskStats.inProgress])

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
      try {
        const data = await fetchServiceStatus()
        if (!data) {
          // fetchServiceStatus 内部 catch 了并返回 null，说明服务通信失败
          throw new Error('heartbeat_failed')
        }
        if (data.modelReady) {
          if (statusPollRef.current && (serviceStatus !== 'starting' && modelLoading !== true)) {
            // 如果模型已就绪且不在启动/加载中，可以降低频率，但不再完全停止，以保持心跳
          }
        }
      } catch (error) {
        console.error('Heartbeat failed:', error)
        if (autoConnectEnabled) {
          // 尝试静默重连
          ensureService(false).catch(() => undefined)
        } else {
          setServiceStatus('error')
          setServiceError('service_unavailable')
        }
      }
    }
    const shouldPoll = serviceStatus === 'ready' || serviceStatus === 'starting' || modelLoading === true
    if (!shouldPoll) return
    
    // 如果是 ready 状态，心跳频率设为 10s；如果是 starting 状态，设为 2s 用于快速感知
    const interval = serviceStatus === 'ready' ? 10000 : 2000
    poll()
    statusPollRef.current = window.setInterval(poll, interval)
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
    const inProgress = tasksWithDisplay.filter((task) =>
      IN_PROGRESS_STATUSES.includes(task.displayStatus)
    ).length
    if (!chrome?.action?.setBadgeText) return
    const badgeText = inProgress > 99 ? '99+' : inProgress ? String(inProgress) : ''
    chrome.action.setBadgeText({ text: badgeText })
    chrome.action.setBadgeBackgroundColor({ color: '#4F46E5' })
  }, [tasksWithDisplay])

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

      // 校验是否为视频播放页
      const isVideoPage = () => {
        try {
          const { hostname, pathname, search } = new URL(url)
          if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            if (hostname === 'youtu.be') return true
            if (pathname.includes('/watch') && search.includes('v=')) return true
            if (pathname.includes('/shorts/')) return true
            if (pathname.includes('/live/')) return true
            return false
          }
          if (hostname.includes('bilibili.com')) {
            if (pathname.includes('/video/')) return true
            if (pathname.includes('/bangumi/play/')) return true
            return false
          }
          return true
        } catch {
          return false
        }
      }

      if (!isVideoPage()) {
        throw new Error(t('errors.notVideoPage'))
      }

      // Collect cookies for the video page to avoid 403 Forbidden errors
      // and support member-only contents.
      let cookies: chrome.cookies.Cookie[] = []
      try {
        cookies = await collectCookies(url)
      } catch (err) {
        console.warn("Failed to collect cookies:", err)
      }

      const payload = {
        url,
        title: tab.title || '',
        site: getSiteFromUrl(url),
        cookies: cookies,
      }
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setFilter('active') // 成功创建后立马切换到进行中标签页
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
    setOptimisticCanceledIds((prev) => {
      const next = new Set(prev)
      next.add(task.id)
      return next
    })
    try {
      await apiFetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
      await refreshTasks()
      showToast('info', t('task.canceled'))
    } catch (error: any) {
      setOptimisticCanceledIds((prev) => {
        if (!prev.has(task.id)) return prev
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
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
    setConfirmModalConfig({
      isOpen: true,
      title: t('modal.deleteTask.title'),
      message: t('modal.deleteTask.message'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
          await refreshTasks()
        } catch (error: any) {
          showToast('error', error.message || t('errors.deleteFailed'))
        }
      },
    })
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
      case 'canceling':
        return 'text-amber-600 bg-amber-50 border-amber-100'
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

      <header className="px-6 py-6 bg-white/80 backdrop-blur-xl border-b border-white/40 flex items-center justify-between sticky top-0 z-20">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{t('app.title')}</h1>
            {/* Live Indicator implementing original service logic visually */}
            <div 
              ref={serviceBadgeRef}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide transition-all cursor-pointer select-none ${
                serviceStatus === 'ready' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : serviceStatus === 'error'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
              onClick={
                serviceStatus === 'ready' 
                  ? handleStopService 
                  : () => ensureService()
              }
              title={serviceStatus === 'ready' ? t('service.stop') : t('service.connecting')}
            >
              <div className="relative flex h-2 w-2">
                {serviceStatus === 'ready' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  serviceStatus === 'ready' 
                    ? 'bg-emerald-600' 
                    : serviceStatus === 'error'
                    ? 'bg-rose-500' 
                    : 'bg-slate-400'
                }`}></span>
              </div>
              <span>
                {serviceStatus === 'ready' ? 'LIVE' : serviceStatus === 'error' ? 'OFFLINE' : 'CONNECTING...'}
              </span>
            </div>
          </div>
          <p className="text-sm font-medium text-slate-500 mt-1">{t('app.subtitle')}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const newLang = i18n.language === 'zh' ? 'en' : 'zh'
              i18n.changeLanguage(newLang)
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 rounded-lg hover:bg-slate-200/50 hover:text-slate-800 transition-all"
          >
            <Globe size={14} />
            <span>{i18n.language === 'zh' ? 'EN' : '中文'}</span>
          </button>
          
          <button
            onClick={startTour}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 rounded-lg hover:bg-slate-200/50 hover:text-slate-800 transition-all"
          >
            <Lightbulb size={14} />
            <span>{t('tour.guide')}</span>
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto px-6 py-6 relative z-10">
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
            className="group flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-white text-sm font-bold shadow-lg shadow-blue-200 disabled:opacity-50 transition-all duration-300 hover:scale-105 hover:bg-blue-700 active:scale-95"
          >
            {isAdding ? <ArrowClockwise size={16} className="animate-spin" /> : <Plus size={18} className="transition-transform duration-300 group-hover:rotate-90" />}
            {t('task.create')}
          </button>
          <button
            onClick={handleClearQueue}
            ref={clearQueueRef}
            className="hidden" // Hiding original Clear Queue button to move it to section header
          >
            {t('task.clearQueue')}
          </button>
        </div>

        <div className="rounded-2xl bg-slate-200/50 p-1 mb-6">
          <div className="flex items-stretch text-xs font-semibold relative">
          {(
            [
              { key: 'active', label: t('task.inProgress'), value: taskStats.inProgress },
              { key: 'done', label: t('task.completed'), value: taskStats.done },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all duration-300 relative z-10 ${
                filter === item.key
                  ? `bg-white shadow-md scale-[1.02] ${item.key === 'active' ? 'text-blue-600' : 'text-emerald-600'}`
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {item.key === 'active' ? (
                  <Activity size={16} weight={filter === item.key ? 'fill' : 'bold'} className={filter === item.key ? 'text-blue-600' : 'text-slate-400'} />
                ) : (
                  <ClockCounterClockwise size={16} weight={filter === item.key ? 'fill' : 'bold'} className={filter === item.key ? 'text-emerald-500' : 'text-slate-400'} />
                )}
                <span>{item.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                   filter === item.key 
                     ? (item.key === 'active' ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-white')
                     : 'bg-slate-300/50 text-slate-600'
                } ${item.key === 'active' && animateActiveCount ? 'animate-badge-bounce' : ''}`}>
                  {item.value}
                </span>
              </div>
            </button>
          ))}
          </div>
        </div>


        <div key={filter} ref={listAreaRef} className="space-y-4 pb-6 animate-slide-in-up">
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
          
          {/* Section Header & Global Actions for Active List */}
          {filter === 'active' && hasSnapshot && filteredTasks.length > 0 && (
             <div className="flex items-center justify-between px-2 mb-2 animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                  IN PROGRESS
                </h2>
                <button
                  onClick={handleClearQueue}
                  className="rounded-full bg-white/40 backdrop-blur-sm border border-slate-200/50 px-3 py-1 text-[11px] font-bold text-slate-500 hover:text-red-500 transition-colors"
                >
                  {t('task.clearQueue')}
                </button>
             </div>
          )}

          {filter === 'active' && modelLoading && taskStats.inProgress > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs font-semibold text-indigo-600 animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                <Megaphone size={12} weight="fill" className="animate-pulse" />
              </div>
              <span>{t('service.modelLoadingHint')}</span>
            </div>
          )}

          {serviceStatus === 'ready' && hasSnapshot && filteredTasks.length === 0 && (
            <div className="group flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-10 transition-colors duration-300 hover:border-indigo-200 animate-slide-in-up">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-transform duration-300 group-hover:scale-110 group-hover:text-indigo-400">
                {filter === 'active' ? (
                  <Sparkle size={32} weight="light" />
                ) : (
                  <ClockCounterClockwise size={32} weight="light" />
                )}
              </div>
              <h3 className="text-sm font-semibold text-slate-400">
                {filter === 'active' ? t('task.noTasks') : t('task.noHistory', 'No completed tasks')}
              </h3>
              {filter !== 'active' && (
                <p className="mt-1 text-xs text-slate-500">
                  {t('task.historyClean', 'Your history is clean')}
                </p>
              )}
            </div>
          )}
          {serviceStatus === 'ready' &&
            hasSnapshot &&
            visibleTasks.map((task, index) => {
            const displayStatus = task.displayStatus
            const isCanceling = displayStatus === 'canceling'
            const isActive = IN_PROGRESS_STATUSES.includes(displayStatus)
            const isCurrent =
              isActive &&
              (activeTaskId === task.id ||
                (!activeTaskId &&
                  (displayStatus === 'downloading' || displayStatus === 'transcribing')))
            const isWaiting = displayStatus === 'queued' && !isCurrent
            const downloadDone = task.downloadProgress >= 100
            const transcribeDone = task.transcribeProgress >= 100
            return (
              <div
                key={`${task.id}-${animateKey}`}
                className={`task-card list-entry group relative transition-all duration-300 ${
                  isActive 
                    ? 'rounded-3xl border border-blue-200 bg-white p-5 shadow-md shadow-blue-500/10 ring-1 ring-blue-50' 
                    : `flex items-center gap-4 rounded-3xl border border-white bg-white/80 p-5 shadow-sm hover:shadow-md hover:border-indigo-100 ${
                        displayStatus === 'canceled' ? 'opacity-70 grayscale-[0.5]' : ''
                      }`
                } ${isWaiting ? '!border-dashed !border-slate-200 !bg-slate-50/50 !opacity-80 hover:!opacity-100 !shadow-none' : ''}`}
                style={{ animationDelay: `${0.05 + index * 0.07}s` }}
              >
                {isActive ? (
                  /* 进行中任务：新版设计 (Running/Queued Task: New Design) */
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      {/* Icon Slot */}
                      <div className={`relative shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center ${
                        isWaiting
                          ? 'bg-slate-100 text-slate-400'
                          : isCanceling
                          ? 'bg-amber-50 text-amber-500'
                          : 'bg-blue-50 text-blue-500'
                      }`}>
                         {isWaiting ? (
                           <Clock size={20} weight="bold" />
                         ) : (
                           <>
                             <CircleNotch
                               size={20}
                               className={`animate-spin ${isCanceling ? 'text-amber-500' : 'text-blue-600'}`}
                               weight="bold"
                             />
                             {!isCanceling && (
                               <span className="absolute top-1 right-1 flex h-2 w-2">
                                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                 <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 animate-pulse"></span>
                               </span>
                             )}
                           </>
                         )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                         {/* Header & Badge */}
                         <div className="flex items-center justify-between mb-1">
                           <div className="flex items-center gap-2">
                             <div className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                               isWaiting
                                 ? 'bg-slate-200 text-slate-600'
                                 : isCanceling
                                 ? 'bg-amber-500 text-white'
                                 : 'bg-blue-600 text-white'
                             }`}>
                               {isWaiting
                                 ? t('task.waitN', { n: task.queuePosition || 1 })
                                 : isCanceling
                                 ? t('task.status.canceling')
                                 : 'RUNNING'}
                             </div>
                           </div>
                           
                           {/* Action Floating Bar */}
                           <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <button
                                onClick={() => handleCancel(task)}
                                className={`p-1.5 rounded-lg transition-all ${
                                  isCanceling
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'
                                }`}
                                title={t('modal.cancelTask.title')}
                                disabled={isCanceling}
                              >
                                <Trash size={16} />
                              </button>
                           </div>
                         </div>

                         {/* Title & Link */}
                         <h3 className="text-sm font-bold text-slate-800 wrap-break-word leading-snug mb-1">
                           {task.title || task.url}
                         </h3>
                         <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3">
                           <Link size={14} className={isWaiting ? 'text-slate-400' : 'text-blue-400'} />
                           <span className="truncate max-w-[200px]">{task.url}</span>
                         </div>

                         {/* Progress / Metadata */}
                         {isWaiting ? (
                           <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 bg-slate-100/50 rounded-lg px-2 py-1.5">
                             <div className="flex items-center gap-1">
                               <Clock size={14} weight="fill" className="text-slate-300" />
                               <span>{t('task.estimatedWait', { n: (task.queuePosition || 1) * 2 })}</span>
                             </div>
                           </div>
                         ) : isCanceling ? (
                           <div className="flex items-center gap-2 text-[11px] font-bold text-amber-600">
                             <CircleNotch size={14} className="animate-spin" />
                             {t('task.status.canceling')}
                           </div>
                         ) : (
                           <div className="space-y-1.5">
                             <div className="flex justify-between text-[11px] font-bold">
                               <span className="text-blue-600">
                                 {displayStatus === 'downloading' ? t('task.status.downloading') : t('task.processing')}
                               </span>
                               <span className="text-blue-600">
                                 {displayStatus === 'downloading' ? task.downloadProgress : task.transcribeProgress}%
                               </span>
                             </div>
                             <div className="h-1.5 w-full bg-blue-50 rounded-full overflow-hidden">
                               <div
                                 className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                                 style={{ width: `${displayStatus === 'downloading' ? task.downloadProgress : task.transcribeProgress}%` }}
                               />
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 已完成/已取消任务：三段式布局 (Completed/Canceled Task: Three-section layout) */
                  <>
                    {/* Left: Status Indicator */}
                    <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      displayStatus === 'done' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {displayStatus === 'done' ? <CheckCircle size={22} weight="fill" /> : <XCircle size={22} weight="fill" />}
                    </div>

                    {/* Middle: Main Content Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <h3 className={`text-sm font-bold wrap-break-word leading-snug ${
                          displayStatus === 'done' ? 'text-slate-900 font-extrabold' : 'text-slate-800'
                        } ${(displayStatus === 'canceled' || displayStatus === 'canceling') ? 'line-through text-slate-400' : ''}`}>
                          {task.title || task.url}
                        </h3>
                      </div>

                      <a
                        href={task.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-600 hover:underline transition-colors mb-1 ${
                          (displayStatus === 'canceled' || displayStatus === 'canceling') ? 'pointer-events-none opacity-50' : ''
                        }`}
                      >
                        <Link size={32} />
                        <span className="truncate">{task.url}</span>
                      </a>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(task.updatedAt).toLocaleString(undefined, {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {displayStatus === 'done' && (
                          <span className="text-emerald-500/80 font-bold">{t('task.status.done')}</span>
                        )}
                        {displayStatus === 'canceled' && (
                          <span className="text-slate-400 font-bold">{t('task.status.canceled')}</span>
                        )}
                      </div>

                      {displayStatus === 'error' && (
                        <div className="mt-2 text-[10px] text-rose-500 font-bold italic">
                          {(task.errorMessage === "服务重启导致任务中断，请重试" ? "任务已取消，请重试" : task.errorMessage) || t('task.failed')}
                        </div>
                      )}
                    </div>

                    {/* Right: Action Floating Bar */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <div className="flex gap-1">
                        {displayStatus === 'error' && (
                          <button
                            onClick={() => handleRetry(task)}
                            className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all hover:scale-110"
                            title={t('task.retry')}
                          >
                            <ArrowClockwise size={18} weight="bold" />
                          </button>
                        )}
                        {displayStatus === 'done' && (
                          <button
                            onClick={() => handleDownload(task)}
                            className="p-2 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all hover:scale-110"
                            title={t('task.downloadTxt')}
                          >
                            <DownloadSimple size={18} weight="bold" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(task)}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all hover:scale-110"
                          title={t('task.delete')}
                        >
                          <Trash size={18} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
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
