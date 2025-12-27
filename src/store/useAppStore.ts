import { create } from 'zustand'

interface AppState {
  isRecording: boolean
  isModelLoading: boolean
  modelProgress: number
  transcription: string
  videoSourceId: string | null
  videoDetected: boolean
  showDownloadConfirm: boolean
  
  setRecording: (recording: boolean) => void
  setModelLoading: (loading: boolean) => void
  setModelProgress: (progress: number) => void
  addTranscription: (text: string) => void
  clearTranscription: () => void
  setVideoSource: (id: string | null) => void
  setVideoDetected: (detected: boolean) => void
  setDownloadConfirm: (show: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  isRecording: false,
  isModelLoading: false,
  modelProgress: 0,
  transcription: '',
  videoSourceId: null,
  videoDetected: false,
  showDownloadConfirm: false,

  setRecording: (recording) => set({ isRecording: recording }),
  setModelLoading: (loading) => set({ isModelLoading: loading }),
  setModelProgress: (progress) => set({ modelProgress: progress }),
  addTranscription: (text) => set((state) => ({ transcription: state.transcription + ' ' + text })),
  clearTranscription: () => set({ transcription: '' }),
  setVideoSource: (id) => set({ videoSourceId: id }),
  setVideoDetected: (detected) => set({ videoDetected: detected }),
  setDownloadConfirm: (show) => set({ showDownloadConfirm: show }),
}))
