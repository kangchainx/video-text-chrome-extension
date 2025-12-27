import React, { useEffect, useRef, useState } from 'react'
import { 
  Play, Stop, Download, VideoCamera, Warning, 
  CheckCircle, Trash, Activity, Sparkle, Info,
  CaretRight, ArrowsClockwise
} from 'phosphor-react'
import { useAppStore } from '../store/useAppStore'
import { pipeline, env } from '@xenova/transformers'

// Configure Transformers.js
// @ts-ignore
env.allowLocalModels = false
// @ts-ignore
env.useBrowserCache = true
// @ts-ignore
env.allowRemoteModels = true
// @ts-ignore
env.useBrowserWorker = false
// @ts-ignore
env.backends.onnx.wasm.numThreads = 1; 

// Filter ONNX warnings
const originalWarn = console.warn;
console.warn = (...args) => {
    const msg = args[0];
    if (typeof msg === 'string') {
        if (msg.includes('Removing initializer')) return;
        if (msg.includes('content-length')) return;
    }
    originalWarn.apply(console, args);
};

const App: React.FC = () => {
  const {
    isRecording,
    isModelLoading,
    modelProgress,
    transcription,
    videoDetected,
    showDownloadConfirm,
    setRecording,
    setModelLoading,
    setModelProgress,
    addTranscription,
    clearTranscription,
    setVideoDetected,
    setDownloadConfirm
  } = useAppStore()

  const [invokedTabId, setInvokedTabId] = useState<number | null>(null)
  const [invokedTabUrl, setInvokedTabUrl] = useState<string>('')
  const [pendingStreamId, setPendingStreamId] = useState<string>('')
  const [pendingStreamAt, setPendingStreamAt] = useState<number>(0)
  const [pendingStreamError, setPendingStreamError] = useState<string>('')

  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Refs for audio processing
  const transcriberRef = useRef<any>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const audioBufferRef = useRef<Float32Array[]>([])

  useEffect(() => {
    // Check initial video status
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VIDEO_STATUS' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response?.detected) setVideoDetected(true)
            })
        }
    })
    
    // Listen for video status updates from content script
    const handleMessage = (message: any) => {
       if (message.type === 'VIDEO_DETECTED') setVideoDetected(message.detected)
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  useEffect(() => {
    chrome.storage.session.get(
      ['invokedTabId', 'invokedTabUrl', 'pendingStreamId', 'pendingStreamAt', 'pendingStreamError'],
      (result) => {
      if (chrome.runtime.lastError) return
      console.log('[sidepanel] session init', result)
      setInvokedTabId(typeof result.invokedTabId === 'number' ? result.invokedTabId : null)
      setInvokedTabUrl(typeof result.invokedTabUrl === 'string' ? result.invokedTabUrl : '')
      setPendingStreamId(typeof result.pendingStreamId === 'string' ? result.pendingStreamId : '')
      setPendingStreamAt(typeof result.pendingStreamAt === 'number' ? result.pendingStreamAt : 0)
      setPendingStreamError(typeof result.pendingStreamError === 'string' ? result.pendingStreamError : '')
    })
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'session') return
      if (changes.invokedTabId) {
        setInvokedTabId(
          typeof changes.invokedTabId.newValue === 'number'
            ? changes.invokedTabId.newValue
            : null
        )
      }
      if (changes.invokedTabUrl) {
        setInvokedTabUrl(
          typeof changes.invokedTabUrl.newValue === 'string'
            ? changes.invokedTabUrl.newValue
            : ''
        )
      }
      if (changes.pendingStreamId) {
        setPendingStreamId(
          typeof changes.pendingStreamId.newValue === 'string'
            ? changes.pendingStreamId.newValue
            : ''
        )
      }
      if (changes.pendingStreamAt) {
        setPendingStreamAt(
          typeof changes.pendingStreamAt.newValue === 'number'
            ? changes.pendingStreamAt.newValue
            : 0
        )
      }
      if (changes.pendingStreamError) {
        setPendingStreamError(
          typeof changes.pendingStreamError.newValue === 'string'
            ? changes.pendingStreamError.newValue
            : ''
        )
      }
    }
    console.log('[sidepanel] session listener on')
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [transcription])

  const mergeBuffers = (buffers: Float32Array[]) => {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0)
    const result = new Float32Array(totalLength)
    let offset = 0
    for (const buf of buffers) {
      result.set(buf, offset)
      offset += buf.length
    }
    return result
  }

  const isSupportedUrl = (url?: string) => {
    if (!url) return false
    try {
      const { hostname } = new URL(url)
      const isYouTube = hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be'
      const isBilibili = hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')
      return isYouTube || isBilibili
    } catch {
      return false
    }
  }

  const setupTranscriber = async () => {
    if (transcriberRef.current) return

    try {
      setModelLoading(true)
      const progress_callback = (data: any) => {
        if (data.status === 'progress') {
          setModelProgress(data.progress)
        }
      }

      transcriberRef.current = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
          progress_callback
      })
      setModelLoading(false)
    } catch (error) {
      console.error('Failed to load model:', error)
      setModelLoading(false)
      alert('模型加载失败: ' + String(error))
      throw error
    }
  }

  const startCapture = async (streamId: string) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        } as any,
        video: false
      })
      
      mediaStreamRef.current = mediaStream
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      sourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStream)
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1)

      sourceRef.current.connect(processorRef.current)
      processorRef.current.connect(audioContextRef.current.destination)

      audioBufferRef.current = []

      processorRef.current.onaudioprocess = async (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        audioBufferRef.current.push(new Float32Array(inputData))

        if (audioBufferRef.current.length > 40) { // Approx 3.7s
           const fullBuffer = mergeBuffers(audioBufferRef.current)
           audioBufferRef.current = []
           
           if (transcriberRef.current) {
               const result = await transcriberRef.current(fullBuffer)
               addTranscription(result.text)
           }
        }
      }
      
      setRecording(true)
    } catch (error) {
      console.error('Capture error:', error)
      alert('录制启动失败: ' + String(error))
      stopCapture()
    }
  }

  const stopCapture = () => {
    if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
    }
    if (sourceRef.current) {
        sourceRef.current.disconnect()
        sourceRef.current = null
    }
    if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
    }
    setRecording(false)
  }

  const handleStartRequest = () => {
    setDownloadConfirm(true)
  }

  const confirmDownload = () => {
    console.log('[sidepanel] confirmDownload click', {
      invokedTabId,
      invokedTabUrl,
      pendingStreamId,
      pendingStreamAt,
      pendingStreamError,
    })
    setDownloadConfirm(false)
    setModelProgress(0)

    chrome.storage.session.get(
      ['invokedTabId', 'invokedTabUrl', 'pendingStreamId', 'pendingStreamAt', 'pendingStreamError'],
      (result) => {
        if (chrome.runtime.lastError) {
          alert('无法读取授权状态，请刷新扩展后重试。')
          return
        }
        const effectiveTabId =
          typeof result.invokedTabId === 'number' ? result.invokedTabId : invokedTabId
        const effectiveTabUrl =
          typeof result.invokedTabUrl === 'string' && result.invokedTabUrl
            ? result.invokedTabUrl
            : invokedTabUrl
        const effectiveStreamId =
          typeof result.pendingStreamId === 'string' ? result.pendingStreamId : pendingStreamId
        const effectiveStreamAt =
          typeof result.pendingStreamAt === 'number' ? result.pendingStreamAt : pendingStreamAt
        const effectiveStreamError =
          typeof result.pendingStreamError === 'string'
            ? result.pendingStreamError
            : pendingStreamError

        if (!effectiveTabId) {
          alert('请在目标视频页点击扩展图标打开侧边栏，以授权当前标签页后再开始录制。')
          return
        }
        if (!isSupportedUrl(effectiveTabUrl)) {
          alert('当前页面不支持录制，请打开 YouTube 或 B 站视频页面后再试。')
          return
        }
        if (effectiveStreamError) {
          alert('启动失败: ' + effectiveStreamError)
          return
        }

        console.log('[sidepanel] stream check', { effectiveStreamAt })
        if (!effectiveStreamId) {
          alert('未获取到录制授权，请再次点击扩展图标打开侧边栏后再开始录制。')
          return
        }

        ;(async () => {
          try {
            await setupTranscriber()
            await startCapture(effectiveStreamId)
          } catch (err: any) {
            console.error('Start failed:', err)
            setModelLoading(false)
            const message = String(err?.message ?? err)
            alert('启动失败: ' + message)
          }
        })()
      }
    )
  }

  const handleStop = () => {
    stopCapture()
  }

  const exportText = () => {
    const blob = new Blob([transcription], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcription-${new Date().toLocaleDateString()}.txt`
    a.click()
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden select-none relative">
      {/* Decorative Background Mesh */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/50 rounded-full blur-[80px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-200/50 rounded-full blur-[80px]" />
      </div>

      {/* Premium Header */}
      <header className="px-6 py-5 bg-white/60 backdrop-blur-xl border-b border-white/40 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100 ring-4 ring-indigo-50/50">
            <Activity size={22} weight="bold" className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-slate-800">转录助手</h1>
            <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase">On-Device AI</p>
          </div>
        </div>
        
        <div className={`px-3 py-1.5 rounded-2xl text-[10px] font-black tracking-wider shadow-sm border transition-all duration-700 ${
          videoDetected 
          ? 'bg-white text-emerald-600 border-emerald-100' 
          : 'bg-white text-rose-500 border-rose-100'
        }`}>
          {videoDetected ? (
            <div className="flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               识别中
            </div>
          ) : '等待视频'}
        </div>
      </header>

      {/* Main Content Area */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 relative z-10 scroll-smooth">
        {!transcription && !isRecording && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700">
            <div className="relative group">
               <div className="w-32 h-32 bg-white rounded-4xl shadow-2xl shadow-indigo-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-500 border border-white">
                 <Sparkle size={56} weight="duotone" className="text-indigo-600 opacity-30" />
               </div>
               <div className="absolute -bottom-2 -right-2 p-4 bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-200 group-hover:rotate-12 transition-transform duration-500">
                  <Play size={28} weight="fill" className="text-white" />
               </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">准备好提取灵感了吗？</h3>
              <p className="text-sm text-slate-400 max-w-[220px] mx-auto leading-relaxed font-medium">
                我们将为您捕捉视频中的每一丝声波，并将其转化为精准的文字。
              </p>
            </div>
          </div>
        )}

        {/* Transcription Stream */}
        <div className="space-y-6 pb-20">
          {transcription && (
            <div className="relative">
              <div className="absolute -left-3 top-0 bottom-0 w-1 bg-indigo-100 rounded-full" />
              <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-6 border border-white shadow-sm leading-relaxed text-[15px] text-slate-700 whitespace-pre-wrap selection:bg-indigo-100 font-medium">
                {transcription}
                {isRecording && (
                  <span className="inline-flex items-center gap-1 ml-2 text-indigo-400">
                    <span className="w-1 h-3 bg-indigo-400/60 rounded-full animate-[bounce_1s_infinite_100ms]" />
                    <span className="w-1 h-5 bg-indigo-500/60 rounded-full animate-[bounce_1s_infinite_200ms]" />
                    <span className="w-1 h-3 bg-indigo-400/60 rounded-full animate-[bounce_1s_infinite_300ms]" />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Floating Download Progress */}
        {isModelLoading && (
          <div className="fixed bottom-36 left-6 right-6 z-30 animate-in fade-in slide-in-from-bottom-8 duration-700">
             <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-4xl p-6 shadow-2xl shadow-slate-950/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-xl">
                      <ArrowsClockwise size={18} className="text-indigo-400 animate-spin" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-white block">正在同步神经网络...</span>
                      <span className="text-[10px] text-slate-400 font-bold tracking-wide uppercase">Stage: Initialization</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-indigo-400">{Math.round(modelProgress)}%</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-px">
                  <div 
                    className="h-full bg-linear-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500 rounded-full"
                    style={{ width: `${modelProgress}%` }}
                  />
                </div>
                <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/5">
                   <Info size={14} className="text-slate-400" />
                   <p className="text-[10px] text-slate-400 font-medium leading-normal">
                     首次同步约需 100MB 资源包，完成后将支持全离线极速识别。
                   </p>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Control Panel */}
      <footer className="px-6 py-6 bg-white border-t border-indigo-50/50 flex flex-col gap-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.03)] z-20">
        <div className="flex gap-3">
          {isModelLoading ? (
            <button
              disabled
              className="flex-1 h-14 bg-slate-100 text-slate-400 rounded-[1.25rem] font-bold flex items-center justify-center gap-2 cursor-wait border border-slate-200"
            >
              <ArrowsClockwise size={20} className="animate-spin" />
              <span>神经元同步中 {Math.round(modelProgress)}%</span>
            </button>
          ) : !isRecording ? (
            <button
              onClick={handleStartRequest}
              className="flex-1 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.25rem] font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/20 group"
            >
              <Play size={20} weight="fill" className="group-hover:rotate-12 transition-transform" />
              <span>开始智能识别</span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex-1 h-14 bg-white border-2 border-rose-500 text-rose-500 hover:bg-rose-50 rounded-[1.25rem] font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              <span>停止转录</span>
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={exportText}
            disabled={!transcription || isRecording}
            className="flex-1 h-11 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-slate-200/50"
          >
            <Download size={16} weight="bold" />
            导出 TXT
          </button>
          <button
            onClick={clearTranscription}
            disabled={!transcription || isRecording}
            className="w-11 h-11 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all border border-slate-200/50"
          >
            <Trash size={18} />
          </button>
        </div>
      </footer>

      {/* Custom Confirmation Dialog */}
      {showDownloadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDownloadConfirm(false)} />
           <div className="relative bg-white rounded-4xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300 border border-indigo-50">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                 <DownloadSimple size={32} weight="duotone" className="text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">下载模型确认</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-8">
                首次使用需要下载约 <span className="text-indigo-600 font-bold underline decoration-indigo-100">100MB</span> 的 AI 模型组件。为了您的数据隐私，转录将完全在您的浏览器本地进行。
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmDownload}
                  className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
                >
                  同意并下载
                </button>
                <button
                  onClick={() => setDownloadConfirm(false)}
                  className="w-full h-12 bg-slate-50 text-slate-500 rounded-xl font-bold hover:bg-slate-100 transition-all"
                >
                  暂不开始
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}

// 补齐缺失图标库
const DownloadSimple = ({ size, weight, className }: any) => <Download size={size} weight={weight} className={className} />

export default App
