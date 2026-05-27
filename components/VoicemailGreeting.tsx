'use client'

import { useRef, useState } from 'react'
import { Mic, Square, Play, Pause, Upload, CheckCircle } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

type RecordingState = 'idle' | 'recording' | 'recorded' | 'saving' | 'saved'

// ── WAV encoder ────────────────────────────────────────────────────────────────
// Encodes a Float32Array of mono PCM samples into a standard WAV Blob.
// WAV (PCM) is one of the three formats Telnyx <Play> accepts (mp3, wav, ogg).
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitsPerSample = 16
  const blockAlign = numChannels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataLength = samples.length * blockAlign
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  function writeStr(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF header
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeStr(8, 'WAVE')
  // fmt sub-chunk
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)          // sub-chunk size
  view.setUint16(20, 1, true)           // PCM = 1
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  // data sub-chunk
  writeStr(36, 'data')
  view.setUint32(40, dataLength, true)
  // PCM samples — convert Float32 → Int16
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export default function VoicemailGreeting() {
  const { agent, setAgent } = useSoftphone()
  const [state, setState] = useState<RecordingState>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // Web Audio recording refs (replaces MediaRecorder — avoids Chrome's WebM-only output)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream

    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    const source = ctx.createMediaStreamSource(stream)
    // ScriptProcessorNode bufferSize=4096 — still widely supported; AudioWorklet would
    // require a separately-served module file which complicates Next.js deployment.
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    pcmChunksRef.current = []

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      // Clone the buffer — the underlying memory is reused after the callback
      pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }

    // Routing: source → processor → silent gain → destination
    // The destination connection is required for onaudioprocess to fire.
    // Zero gain prevents any audio going to the speakers.
    const silent = ctx.createGain()
    silent.gain.value = 0
    source.connect(processor)
    processor.connect(silent)
    silent.connect(ctx.destination)

    // Elapsed timer
    setElapsed(0)
    elapsedTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

    setState('recording')
  }

  function stopRecording() {
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }

    const ctx = audioCtxRef.current
    const processor = processorRef.current
    const stream = streamRef.current

    processor?.disconnect()
    stream?.getTracks().forEach(t => t.stop())

    if (!ctx) { setState('idle'); return }

    const sampleRate = ctx.sampleRate
    ctx.close().catch(() => {})
    audioCtxRef.current = null
    processorRef.current = null
    streamRef.current = null

    // Flatten PCM chunks into one Float32Array, then encode as WAV
    const chunks = pcmChunksRef.current
    const totalLen = chunks.reduce((n, c) => n + c.length, 0)
    if (totalLen === 0) { setState('idle'); return }

    const combined = new Float32Array(totalLen)
    let off = 0
    for (const chunk of chunks) { combined.set(chunk, off); off += chunk.length }

    const wavBlob = encodeWAV(combined, sampleRate)
    setBlob(wavBlob)
    setAudioUrl(URL.createObjectURL(wavBlob))
    setState('recorded')
  }

  function togglePlay() {
    if (!audioUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  async function uploadToApi(file: File) {
    if (!agent) return
    setState('saving')
    const formData = new FormData()
    formData.append('agentId', agent.id)
    formData.append('file', file)

    const res = await fetch('/api/voicemail/greeting', { method: 'POST', body: formData })
    if (!res.ok) {
      console.error('Greeting upload failed', await res.text())
      setState('recorded')
      return
    }
    const data = await res.json()
    setAgent({ ...agent, voicemail_greeting_url: data.url })
    setState('saved')
  }

  async function saveRecording() {
    if (!blob || !agent) return
    const file = new File([blob], 'greeting.wav', { type: 'audio/wav' })
    await uploadToApi(file)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setBlob(null)
    setAudioUrl(null)
    await uploadToApi(file)
  }

  function discard() {
    setState('idle')
    setBlob(null)
    setAudioUrl(null)
    setElapsed(0)
  }

  const hasExisting = !!agent?.voicemail_greeting_url
  const existingPath = (agent?.voicemail_greeting_url ?? '').split('?')[0].toLowerCase()
  const greetingIsCompatible =
    existingPath.endsWith('.mp3') || existingPath.endsWith('.wav') || existingPath.endsWith('.ogg')

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-medium text-sm">Voicemail Greeting</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {hasExisting && state === 'idle'
              ? greetingIsCompatible
                ? 'Custom greeting active'
                : 'Saved greeting is not compatible — upload an MP3 or WAV file'
              : 'Record a message or upload an MP3 / WAV file'}
          </p>
        </div>
        {(state === 'saved' || (hasExisting && greetingIsCompatible && state === 'idle')) && (
          <CheckCircle className="w-4 h-4 text-green-400" />
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {(state === 'idle' || state === 'saved') && (
          <>
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Mic className="w-4 h-4" />
              {hasExisting ? 'Re-record' : 'Record'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload MP3 / WAV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
              className="hidden"
              onChange={handleFileUpload}
            />
          </>
        )}

        {state === 'recording' && (
          <>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
            <span className="text-red-400 text-sm font-mono animate-pulse">
              ● {mm}:{ss}
            </span>
          </>
        )}

        {state === 'saving' && (
          <span className="text-gray-400 text-sm animate-pulse">Saving…</span>
        )}

        {state === 'recorded' && (
          <>
            <button
              onClick={togglePlay}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? 'Pause' : 'Preview'}
            </button>
            <button
              onClick={saveRecording}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={discard}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
