'use client'

import { useRef, useState } from 'react'
import { Play, Pause, Volume2, Trash2 } from 'lucide-react'
import { Voicemail } from '@/lib/types'

interface Props {
  voicemail: Voicemail
  onListened: (id: string) => void
  onDelete: (id: string) => void
}

export default function VoicemailPlayer({ voicemail, onListened, onDelete }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [deleting, setDeleting] = useState(false)

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
      if (!voicemail.listened) {
        fetch('/api/voicemail', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: voicemail.id, listened: true }),
        }).catch(console.error)
        onListened(voicemail.id)
      }
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio || !duration) return
    const t = (parseFloat(e.target.value) / 100) * duration
    audio.currentTime = t
    setProgress(parseFloat(e.target.value))
  }

  async function handleDelete() {
    if (!confirm('Delete this voicemail?')) return
    setDeleting(true)
    try {
      await fetch(`/api/voicemail?id=${voicemail.id}`, { method: 'DELETE' })
      onDelete(voicemail.id)
    } catch (err) {
      console.error(err)
      setDeleting(false)
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white font-medium">{voicemail.from_number}</p>
          <p className="text-gray-400 text-xs">{new Date(voicemail.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          {!voicemail.listened && (
            <span className="w-2 h-2 rounded-full bg-blue-500" title="Unheard" />
          )}
          <Volume2 className="w-4 h-4 text-gray-500" />
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete voicemail"
            className="text-gray-500 hover:text-red-400 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {voicemail.transcription && (
        <p className="text-gray-300 text-sm mb-3 italic">"{voicemail.transcription}"</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={seek}
            className="w-full accent-blue-500 h-1"
          />
        </div>

        <span className="text-gray-400 text-xs font-mono shrink-0">
          {fmt(duration > 0 ? (progress / 100) * duration : 0)} / {fmt(duration)}
        </span>
      </div>

      <audio
        ref={audioRef}
        src={voicemail.recording_url}
        onTimeUpdate={() => {
          const audio = audioRef.current
          if (audio && audio.duration) {
            setProgress((audio.currentTime / audio.duration) * 100)
          }
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => { setPlaying(false); setProgress(0) }}
      />
    </div>
  )
}
