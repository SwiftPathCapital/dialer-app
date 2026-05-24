'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneIncoming, PhoneOutgoing, Clock, Play, Pause, Voicemail } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface CallRow {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  status: string
  disposition: string | null
  duration_seconds: number | null
  recording_url: string | null
  started_at: string
  agents: { id: string; name: string; email: string } | null
}

interface Recording {
  id: string
  from_number: string
  recording_url: string
  transcription: string | null
  listened: boolean
  created_at: string
  dialer_calls: {
    from_number: string
    to_number: string
    direction: string
    agents: { name: string } | null
  } | null
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function AudioPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)

  function toggle() {
    if (!ref.current) {
      ref.current = new Audio(url)
      ref.current.onended = () => setPlaying(false)
    }
    if (playing) { ref.current.pause(); setPlaying(false) }
    else { ref.current.play(); setPlaying(true) }
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors"
    >
      {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      {playing ? 'Pause' : 'Play'}
    </button>
  )
}

export default function AdminCallsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [tab, setTab] = useState<'history' | 'recordings'>('history')
  const [calls, setCalls] = useState<CallRow[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [filterAgent, setFilterAgent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    fetch('/api/agents').then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : []))
    loadCalls('')
    loadRecordings()
  }, [agent, agentLoading, router])

  async function loadCalls(agentId: string) {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (agentId) params.set('agent_id', agentId)
    const res = await fetch(`/api/admin/calls?${params}`)
    const data = await res.json()
    setCalls(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function loadRecordings() {
    const res = await fetch('/api/admin/recordings')
    const data = await res.json()
    setRecordings(Array.isArray(data) ? data : [])
  }

  function handleAgentFilter(id: string) {
    setFilterAgent(id)
    loadCalls(id)
  }

  if (!agent) return null

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-5">Call Center</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {(['history', 'recordings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t === 'history' ? 'Call History' : 'Recordings'}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <div className="space-y-4">
          {/* Agent filter */}
          <div className="flex items-center gap-3">
            <select
              value={filterAgent}
              onChange={e => handleAgentFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="">All Agents</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <span className="text-gray-500 text-sm">{calls.length} calls</span>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : calls.length === 0 ? (
            <p className="text-gray-600 text-sm">No calls found</p>
          ) : (
            <div className="space-y-2">
              {calls.map(call => (
                <div key={call.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                  <span className={`p-2 rounded-full shrink-0 ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                    {call.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium">
                        {call.direction === 'inbound' ? call.from_number : call.to_number}
                      </p>
                      {call.disposition && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300">{call.disposition}</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">
                      {call.agents?.name || 'No agent'} · {new Date(call.started_at).toLocaleString()} · {call.status}
                    </p>
                  </div>
                  {call.duration_seconds != null && (
                    <div className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                      <Clock className="w-3 h-3" />
                      {fmt(call.duration_seconds)}
                    </div>
                  )}
                  {call.recording_url && <AudioPlayer url={call.recording_url} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'recordings' && (
        <div className="space-y-2">
          {recordings.length === 0 ? (
            <p className="text-gray-600 text-sm">No recordings yet</p>
          ) : (
            recordings.map(rec => (
              <div key={rec.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                <span className="p-2 rounded-full bg-purple-900/40 text-purple-400 shrink-0">
                  <Voicemail className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{rec.from_number}</p>
                  <p className="text-gray-500 text-xs">
                    {rec.dialer_calls?.agents?.name || 'Group voicemail'} · {new Date(rec.created_at).toLocaleString()}
                  </p>
                  {rec.transcription && (
                    <p className="text-gray-400 text-xs mt-1 italic">"{rec.transcription}"</p>
                  )}
                </div>
                <AudioPlayer url={rec.recording_url} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
