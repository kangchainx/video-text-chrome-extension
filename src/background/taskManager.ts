import { TaskItem, TasksSnapshot } from './types'

/**
 * Background Task Manager
 *
 * Manages SSE connection to Python backend, tracks task state,
 * updates badge, and sends notifications when tasks complete.
 */
export class BackgroundTaskManager {
  private tasks: TaskItem[] = []
  private activeTaskId: string | null = null
  private sseConnection: EventSource | null = null
  private servicePort: number | null = null
  private serviceToken: string | null = null
  private isSidepanelOpen: boolean = false
  private reconnectAttempts: number = 0
  private reconnectTimer: number | null = null
  private restorePromise: Promise<void> | null = null

  // Track tasks that have been notified to avoid duplicate notifications
  private notifiedTaskIds: Set<string> = new Set()

  // Task states
  private readonly IN_PROGRESS_STATES = ['queued', 'downloading', 'transcribing']
  private readonly COMPLETED_STATES = ['done', 'canceled', 'error']

  /**
   * Start SSE connection to Python backend
   */
  startSSE(port: number, token: string): void {
    // console.log('[TaskManager] Starting SSE connection', { port })

    // Store credentials for reconnection
    this.servicePort = port
    this.serviceToken = token

    // Close existing connection
    this.stopSSE(false)

    // Create new SSE connection
    const url = `http://127.0.0.1:${port}/api/tasks/stream?token=${token}`
    this.sseConnection = new EventSource(url)

    this.sseConnection.onopen = () => {
      // console.log('[TaskManager] SSE connection opened')
      this.reconnectAttempts = 0
    }

    this.sseConnection.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data)
        this.onTasksUpdate(snapshot)
      } catch (error) {
        console.error('[TaskManager] Failed to parse SSE message', error)
      }
    }

    this.sseConnection.onerror = (error) => {
      console.error('[TaskManager] SSE error', error)
      this.sseConnection?.close()
      this.sseConnection = null

      // Attempt to reconnect with exponential backoff
      this.scheduleReconnect()
    }
  }

  /**
   * Stop SSE connection
   */
  stopSSE(resetBackoff: boolean = true): void {
    if (this.sseConnection) {
      // console.log('[TaskManager] Stopping SSE connection')
      this.sseConnection.close()
      this.sseConnection = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (resetBackoff) {
      this.reconnectAttempts = 0
    }
  }

  /**
   * Persist SSE credentials for MV3 worker restarts.
   */
  persistSSECredentials(port: number, token: string): void {
    chrome.storage.local.set({
      sseCredentials: { port, token }
    })
  }

  /**
   * Clear persisted SSE credentials.
   */
  clearSSECredentials(): void {
    chrome.storage.local.remove('sseCredentials')
  }

  /**
   * Restore SSE credentials and restart SSE if needed.
   */
  async restoreSSEFromStorage(): Promise<void> {
    if (this.restorePromise) {
      return this.restorePromise
    }

    this.restorePromise = new Promise((resolve) => {
      chrome.storage.local.get(['sseCredentials'], (result) => {
        const creds = result?.sseCredentials
        if (creds && typeof creds.port === 'number' && typeof creds.token === 'string') {
          this.servicePort = creds.port
          this.serviceToken = creds.token
          if (!this.sseConnection) {
            this.startSSE(creds.port, creds.token)
          }
        }
        this.restorePromise = null
        resolve()
      })
    })

    return this.restorePromise
  }

  /**
   * Ensure SSE is active if credentials are available.
   */
  ensureSSEConnection(): void {
    if (this.sseConnection) return
    if (this.servicePort && this.serviceToken) {
      this.startSSE(this.servicePort, this.serviceToken)
      return
    }
    void this.restoreSSEFromStorage()
  }

  /**
   * Schedule SSE reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.servicePort || !this.serviceToken) {
      // console.log('[TaskManager] Cannot reconnect - missing credentials')
      return
    }

    // Clear existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    // Calculate backoff delay (2^attempts seconds, max 30s)
    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000)
    this.reconnectAttempts++

    // console.log(`[TaskManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      if (this.servicePort && this.serviceToken) {
        this.startSSE(this.servicePort, this.serviceToken)
      }
    }, delay) as unknown as number
  }

  /**
   * Handle task updates from SSE stream
   */
  private onTasksUpdate(snapshot: TasksSnapshot): void {
    // Store previous state for comparison
    const previousTasks = new Map(this.tasks.map(t => [t.id, t]))

    // console.log('[TaskManager] Tasks updated', {
    //   taskCount: snapshot.tasks.length,
    //   activeTaskId: snapshot.activeTaskId,
    //   tasks: snapshot.tasks.map(t => ({ id: t.id, status: t.status, title: t.title }))
    // })

    // Update current state
    this.tasks = snapshot.tasks
    this.activeTaskId = snapshot.activeTaskId

    // Detect completed tasks and send notifications
    this.detectCompletedTasks(previousTasks, snapshot.tasks)

    // Update extension badge
    this.updateBadge()
  }

  /**
   * Detect tasks that have completed and send notifications
   */
  private detectCompletedTasks(
    previousTasks: Map<string, TaskItem>,
    newTasks: TaskItem[]
  ): void {
    for (const task of newTasks) {
      const prev = previousTasks.get(task.id)

      // console.log('[TaskManager] Checking task', {
      //   taskId: task.id,
      //   hasPrev: !!prev,
      //   prevStatus: prev?.status,
      //   currentStatus: task.status,
      //   isInProgress: prev ? this.IN_PROGRESS_STATES.includes(prev.status) : false,
      //   isCompleted: this.COMPLETED_STATES.includes(task.status),
      //   alreadyNotified: this.notifiedTaskIds.has(task.id),
      //   sidepanelOpen: this.isSidepanelOpen
      // })

      // Task transitioned from in-progress to completed
      if (prev &&
          this.IN_PROGRESS_STATES.includes(prev.status) &&
          this.COMPLETED_STATES.includes(task.status) &&
          !this.notifiedTaskIds.has(task.id)) {

        console.log('[TaskManager] Task completed, checking notification conditions', {
          taskId: task.id,
          status: task.status,
          sidepanelOpen: this.isSidepanelOpen
        })

        // Send notification when sidepanel is closed
        // Note: No notification for 'canceled' status since user initiated it
        if (!this.isSidepanelOpen) {
          if (task.status === 'done') {
            this.notifyTaskCompleted(task)
          } else if (task.status === 'error') {
            this.notifyTaskFailed(task)
          }
        } else {
          console.log('[TaskManager] Skipping notification - sidepanel is open')
        }

        // Mark as notified to avoid duplicates
        this.notifiedTaskIds.add(task.id)
      }
    }

    // Clean up old notified task IDs (keep last 100)
    if (this.notifiedTaskIds.size > 100) {
      const idsArray = Array.from(this.notifiedTaskIds)
      this.notifiedTaskIds = new Set(idsArray.slice(-100))
    }
  }

  /**
   * Send Chrome notification for completed task
   */
  private notifyTaskCompleted(task: TaskItem): void {
    const title = task.title || task.url
    const message = task.title ? task.url : '转录完成'

    console.log('[TaskManager] Sending notification for completed task', { taskId: task.id, title })

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'public/icons/icon128.png',
      title: '✅ 任务完成',
      message: `${title}\n${message}`,
      priority: 2,
      requireInteraction: false
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('[TaskManager] Notification create error:', chrome.runtime.lastError)
      } else {
        console.log('[TaskManager] Notification created successfully', { notificationId })
      }
    })
  }

  /**
   * Send Chrome notification for failed task
   */
  private notifyTaskFailed(task: TaskItem): void {
    const title = task.title || task.url
    const errorMsg = task.errorMessage || '未知错误'

    console.log('[TaskManager] Sending notification for failed task', { taskId: task.id, title, error: errorMsg })

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'public/icons/icon128.png',
      title: '❌ 任务失败',
      message: `${title}\n错误: ${errorMsg}`,
      priority: 2,
      requireInteraction: false
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('[TaskManager] Notification create error:', chrome.runtime.lastError)
      } else {
        console.log('[TaskManager] Notification created successfully', { notificationId })
      }
    })
  }


  /**
   * Update extension badge with in-progress task count
   */
  private updateBadge(): void {
    const inProgressCount = this.tasks.filter(t =>
      this.IN_PROGRESS_STATES.includes(t.status)
    ).length

    const badgeText = inProgressCount > 99 ? "99+" :
                      inProgressCount > 0 ? String(inProgressCount) : ""

    chrome.action.setBadgeText({ text: badgeText })
    chrome.action.setBadgeBackgroundColor({ color: "#4F46E5" })
  }

  /**
   * Get current tasks snapshot (called by sidepanel)
   */
  getTasks(): TasksSnapshot {
    return {
      tasks: this.tasks,
      activeTaskId: this.activeTaskId
    }
  }

  /**
   * Update sidepanel open state
   */
  setSidepanelOpen(isOpen: boolean): void {
    console.log('[TaskManager] Sidepanel state changed', { isOpen })
    this.isSidepanelOpen = isOpen
  }
}

// Singleton instance
export const taskManager = new BackgroundTaskManager()
