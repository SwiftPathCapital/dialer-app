'use client'

import { useRef, useState } from 'react'
import { Mic, Square, Play, Pause, Upload, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Prefer OGG (Telnyx-compatible); fall back to whatever the browser supports
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

  async function save() {
    if (!blob || !agent) return
    setState('saving')

    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
    const path = `${agent.id}/greeting.${ext}`

    const { error } = await supabase.storage
      .from('voicemail-greetings')
      .upload(path, blob, { contentType: blob.type, upsert: true })

    if (error) { console.error(error); setState('recorded'); return }

    const { data: { publicUrl } } = supabase.storage
      .from('voicemail-greetings')
      .getPublicUrl(path)

    await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agent.id, voicemail_greeting_url: publicUrl }),
    })

    setAgent({ ...agent, voicemail_greeting_url: publicUrl })
    setState('saved')
  }

  const hasExisting = !!agent?.voicemail_greeting_url

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-medium text-sm">Voicemail Greeting</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {hasExisting && state === 'idle' ? 'Custom greeting active' : 'Record a personal greeting for callers'}
          </p>
        </div>
        {(state === 'saved' || (hasExisting && state === 'idle')) && (
          <CheckCircle className="w-4 h-4 text-green-400" />
        )}
      </div>

      <div className="flex items-center gap-3">
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

        {(state === 'recorded' || state === 'saving') && (
          <>
            <button
              onClick={togglePlay}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? 'Pause' : 'Preview'}
            </button>
            <button
              onClick={save}
              disabled={state === 'saving'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              {state === 'saving' ? 'Saving…' : 'Save'}
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
    </div>
  )
}
