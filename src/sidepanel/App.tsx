import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  DownloadSimple,
  Plus,
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

const App: React.FC = () => {
  const [serviceStatus, setServiceStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle')
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [servicePort, setServicePort] = useState<number | null>(null)
  const [serviceToken, setServiceToken] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [visibleCount, setVisibleCount] = useState(5)
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  const sseRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)

  const apiBase = useMemo(() => {
    if (!servicePort) return null
    return `http://127.0.0.1:${servicePort}`
  }, [servicePort])

  const taskStats = useMemo(() => {
    const total = tasks.length
    const inProgress = tasks.filter((task) =>
      ['queued', 'downloading', 'transcribing'].includes(task.status)
    ).length
    const done = tasks.filter((task) =>
      ['done', 'canceled', 'error'].includes(task.status)
    ).length
    return { total, inProgress, done }
  }, [tasks])

  const filteredTasks = useMemo(() => {
    if (filter === 'active') {
      return tasks.filter((task) =>
        ['queued', 'downloading', 'transcribing'].includes(task.status)
      )
    }
    if (filter === 'done') {
      return tasks.filter((task) => ['done', 'canceled', 'error'].includes(task.status))
    }
    return tasks
  }, [tasks, filter])

  const visibleTasks = useMemo(
    () => filteredTasks.slice(0, visibleCount),
    [filteredTasks, visibleCount]
  )

  useEffect(() => {
    setVisibleCount(5)
  }, [filter])

  const connectNative = () => {
    return new Promise<{ port: number; token: string }>((resolve, reject) => {
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
          resolve({ port: response.port, token: response.token })
        }
      )
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
    } catch (error) {
      console.error(error)
    }
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

  const ensureService = async () => {
    setServiceStatus('connecting')
    setServiceError(null)
    try {
      const result = await connectNative()
      setServicePort(result.port)
      setServiceToken(result.token)
      setServiceStatus('ready')
      return result
    } catch (error: any) {
      setServiceStatus('error')
      setServiceError(error.message || '本地服务不可用')
      throw error
    }
  }

  useEffect(() => {
    ensureService().catch(() => undefined)
    return () => {
      if (sseRef.current) {
        sseRef.current.close()
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!apiBase || !serviceToken) return
    refreshTasks()
    startSse()
  }, [apiBase, serviceToken])

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

  const handleAddTask = async () => {
    setIsAdding(true)
    try {
      if (serviceStatus !== 'ready') {
        await ensureService()
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
      alert(error.message || '添加任务失败')
    } finally {
      setIsAdding(false)
    }
  }

  const handleCancel = async (task: TaskItem) => {
    if (!window.confirm('确认取消该任务？')) return
    try {
      await apiFetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
      await refreshTasks()
    } catch (error: any) {
      alert(error.message || '取消失败')
    }
  }

  const handleRetry = async (task: TaskItem) => {
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
      alert(error.message || '重试失败')
    }
  }

  const handleDelete = async (task: TaskItem) => {
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      await refreshTasks()
    } catch (error: any) {
      alert(error.message || '删除失败')
    }
  }

  const handleClearQueue = async () => {
    try {
      await apiFetch('/api/tasks/clear', {
        method: 'POST',
        body: JSON.stringify({ include_done: false }),
      })
      await refreshTasks()
    } catch (error: any) {
      alert(error.message || '清空队列失败')
    }
  }

  const handleLoadMore = () => {
    const nextCount = Math.min(filteredTasks.length, visibleCount + 5)
    setVisibleCount(nextCount)
  }

  const handleDownload = (task: TaskItem) => {
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
        <div
          className={`px-3 py-1.5 rounded-2xl text-[10px] font-black tracking-wider shadow-sm border ${
            serviceStatus === 'ready'
              ? 'bg-white text-emerald-600 border-emerald-100'
              : serviceStatus === 'connecting'
                ? 'bg-white text-indigo-500 border-indigo-100'
                : 'bg-white text-rose-500 border-rose-100'
          }`}
        >
          {serviceStatus === 'ready' ? '服务已连接' : serviceStatus === 'connecting' ? '连接中' : '服务未连接'}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6 relative z-10">
        {serviceStatus === 'error' && (
          <div className="mb-6 rounded-3xl border border-rose-100 bg-rose-50/80 p-4 text-rose-600 text-sm shadow-sm">
            <div className="flex items-start gap-3">
              <WarningCircle size={18} className="mt-0.5" />
              <div>
                <p className="font-semibold">本地服务未就绪</p>
                <p className="text-xs text-rose-500 mt-1">{serviceError || '请检查本地服务与 Native Host 安装。'}</p>
                <button
                  onClick={ensureService}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-white text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <ArrowClockwise size={14} />
                  重新连接
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-5">
          <button
            onClick={handleAddTask}
            disabled={serviceStatus !== 'ready' || isAdding}
            className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-white text-sm font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-indigo-600/40"
          >
            {isAdding ? <ArrowClockwise size={16} className="animate-spin" /> : <Plus size={16} />}
            创建转写任务
          </button>
          <button
            onClick={handleClearQueue}
            className="text-xs font-bold text-slate-500 transition-all duration-200 hover:text-slate-700 hover:-translate-y-0.5"
          >
            清空队列
          </button>
        </div>

        <div className="rounded-[18px] bg-[#F5F7FA] px-2 py-2">
          <div className="flex items-stretch text-xs font-semibold">
          {(
            [
              { key: 'all', label: '全部', value: taskStats.total },
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
        <div className="flex justify-end mb-2 text-[11px] text-slate-400">
          <span>{sseStatus === 'connected' ? '实时更新' : sseStatus === 'connecting' ? '连接中' : '连接中断'}</span>
        </div>

        <div className="space-y-4 pb-6">
          {filteredTasks.length === 0 && (
            <div className="rounded-3xl border border-white bg-white/70 p-8 text-center text-slate-400 text-sm">
              暂无任务，打开视频页面后点击“创建转写任务”。
            </div>
          )}
          {visibleTasks.map((task) => {
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
                key={task.id}
                className={`relative rounded-3xl border border-white bg-white/80 p-5 shadow-sm ${
                  isCurrent ? 'ring-2 ring-indigo-200 shadow-md' : ''
                } ${isWaiting ? 'opacity-60' : ''}`}
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
    </div>
  )
}

export default App
