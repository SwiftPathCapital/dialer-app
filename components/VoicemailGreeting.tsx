'use client'

import { useRef, useState } from 'react'
import { Mic, Square, Play, Pause, Upload, CheckCircle } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

type RecordingState = 'idle' | 'recording' | 'recorded' | 'saving' | 'saved'

export default function VoicemailGreeting() {
  const { agent, setAgent } = useSoftphone()
  const [state, setState] = useState<RecordingState>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Prefer OGG (Telnyx-compatible); fall back to whatever the browser supports.
    // Note: Chrome records WebM which Telnyx cannot play — use Upload MP3 on Chrome.
    const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : 'audio/webm;codecs=opus'
    const mr = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    mr.ondataavailable = e => chunksRef.current.push(e.data)
    mr.onstop = () => {
      const recorded = new Blob(chunksRef.current, { type: mr.mimeType })
      setBlob(recorded)
      setAudioUrl(URL.createObjectURL(recorded))
      setState('recorded')
      stream.getTracks().forEach(t => t.stop())
    }
    mr.start()
    mediaRecorderRef.current = mr
    setState('recording')
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
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

  /** Upload a Blob or File through the server API (handles storage + cache-busting). */
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
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `greeting.${ext}`, { type: blob.type })
    await uploadToApi(file)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-selected after cancelling
    e.target.value = ''
    setBlob(null)
    setAudioUrl(null)
    await uploadToApi(file)
  }

  const hasExisting = !!agent?.voicemail_greeting_url
  // Check if the saved greeting is in a Telnyx-playable format
  const existingPath = (agent?.voicemail_greeting_url ?? '').split('?')[0].toLowerCase()
  const greetingIsCompatible =
    existingPath.endsWith('.mp3') || existingPath.endsWith('.wav') || existingPath.endsWith('.ogg')

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-medium text-sm">Voicemail Greeting</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {hasExisting && state === 'idle'
              ? greetingIsCompatible
                ? 'Custom greeting active'
                : 'Greeting saved but not compatible — upload an MP3 or WAV'
              : 'Record or upload a personal greeting for callers'}
          </p>
        </div>
        {(state === 'saved' || (hasExisting && greetingIsCompatible && state === 'idle')) && (
          <CheckCircle className="w-4 h-4 text-green-400" />
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Browser recording — works best on Firefox (OGG). Chrome records WebM which Telnyx can't play. */}
        {state === 'idle' || state === 'saved' ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Mic className="w-4 h-4" />
            {hasExisting ? 'Re-record' : 'Record'}
          </button>
        ) : state === 'recording' ? (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium rounded-lg transition-colors animate-pulse"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        ) : null}

        {/* File upload — MP3 or WAV is recommended (Telnyx-compatible on all browsers) */}
        {(state === 'idle' || state === 'saved') && (
          <>
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

        {state === 'saving' && (
          <span className="text-gray-400 text-sm animate-pulse">Saving…</span>
        )}

        {(state === 'recorded') && (
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
              onClick={() => { setState('idle'); setBlob(null); setAudioUrl(null) }}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {/* Warning for Chrome users who recorded (WebM) */}
      {state === 'recorded' && blob?.type.includes('webm') && (
        <p className="mt-3 text-yellow-500 text-xs">
          ⚠ Your browser recorded in WebM format, which Telnyx cannot play. Use <strong>Upload MP3 / WAV</strong> instead for a compatible greeting.
        </p>
      )}
    </div>
  )
}
