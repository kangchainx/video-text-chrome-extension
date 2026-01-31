// Type definitions for background task management

export type TaskStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "canceling"
  | "done"
  | "error"
  | "canceled"

export interface TaskItem {
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

export interface TasksSnapshot {
  tasks: TaskItem[]
  activeTaskId: string | null
}

export type MessageType =
  | 'START_SSE'
  | 'STOP_SSE'
  | 'GET_TASKS'
