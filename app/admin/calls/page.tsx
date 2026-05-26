'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneIncoming, PhoneOutgoing, Clock, Voicemail, Pencil, Check, X, Play, Pause, MicVocal } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface CallRow {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  status: string
  disposition: string | null
  notes: string | null
  duration_seconds: number | null
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

interface CallRecording {
  id: string
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  duration_seconds: number | null
  started_at: string
  recording_url: string
  agents: { id: string; name: string } | null
}

const DISPOSITIONS = ['Interested', 'Callback', 'Not Interested', 'No Answer', 'Wrong Number', 'DNC']

const DISPO_COLORS: Record<string, string> = {
  'Interested':     'bg-green-900/40 text-green-300',
  'Callback':       'bg-blue-900/40 text-blue-300',
  'Not Interested': 'bg-red-900/40 text-red-300',
  'No Answer':      'bg-gray-700 text-gray-400',
  'Wrong Number':   'bg-yellow-900/40 text-yellow-300',
  'DNC':            'bg-orange-900/40 text-orange-300',
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function EditableCall({ call, onSaved }: { call: CallRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [dispo, setDispo] = useState(call.disposition || '')
  const [notes, setNotes] = useState(call.notes || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/admin/calls', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: call.id, disposition: dispo || null, notes: notes.trim() || null }),
    })
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`p-2 rounded-full shrink-0 ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
          {call.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-sm font-medium">
              {call.direction === 'inbound' ? call.from_number : call.to_number}
            </p>
            {call.disposition && !editing && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${DISPO_COLORS[call.disposition] || 'bg-gray-700 text-gray-300'}`}>
                {call.disposition}
              </span>
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
        {editing ? (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={save} disabled={saving} className="text-green-400 hover:text-green-300 disabled:opacity-50"><Check className="w-4 h-4" /></button>
            <button onClick={() => { setEditing(false); setDispo(call.disposition || ''); setNotes(call.notes || '') }} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-300 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
        )}
      </div>

      {!editing && call.notes && (
        <div className="px-4 pb-3 pl-14">
          <p className="text-gray-500 text-xs italic">"{call.notes}"</p>
        </div>
      )}

      {editing && (
        <div className="border-t border-gray-700 px-4 pb-4 pt-3 space-y-3">
          <div>
            <label className="text-gray-500 text-xs mb-1 block">Disposition</label>
            <select
              value={dispo}
              onChange={e => setDispo(e.target.value)}
              className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
            >
              <option value="">— none —</option>
              {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-gray-500 text-xs mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add or edit call notes…"
              className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 resize-none border border-gray-700"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() } else { el.play().catch(() => {}) }
    setPlaying(!playing)
  }

  function onTimeUpdate() {
    const el = audioRef.current
    if (!el || !el.duration) return
    setProgress(el.currentTime / el.duration)
  }

  function onLoadedMetadata() {
    if (audioRef.current) setDuration(audioRef.current.duration)
  }

  function onEnded() { setPlaying(false); setProgress(0) }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current
    if (!el) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.currentTime = ((e.clientX - rect.left) / rect.width) * el.duration
  }

  return (
    <div className="flex items-center gap-3 mt-2">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        preload="metadata"
      />
      <button
        onClick={toggle}
        className="shrink-0 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white transition-colors"
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div
        className="flex-1 h-1.5 bg-gray-700 rounded-full cursor-pointer relative"
        onClick={seek}
      >
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {duration > 0 && (
        <span className="text-gray-500 text-xs shrink-0">{fmt(Math.round(duration))}</span>
      )}
    </div>
  )
}

const DURATION_PRESETS = [
  { label: 'All', min: 0, max: null },
  { label: '< 1 min', min: 0, max: 59 },
  { label: '1–3 min', min: 60, max: 179 },
  { label: '3–10 min', min: 180, max: 599 },
  { label: '10+ min', min: 600, max: null },
]

export default function AdminCallsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [tab, setTab] = useState<'history' | 'voicemails' | 'callrecordings'>('history')
  const [calls, setCalls] = useState<CallRow[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [callRecordings, setCallRecordings] = useState<CallRecording[]>([])
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [filterAgent, setFilterAgent] = useState('')
  const [durationPreset, setDurationPreset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [recLoading, setRecLoading] = useState(false)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    fetch('/api/agents').then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : []))
    loadCalls('')
    loadVoicemails()
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

  async function loadVoicemails() {
    const res = await fetch('/api/admin/recordings')
    const data = await res.json()
    setRecordings(Array.isArray(data) ? data : [])
  }

  async function loadCallRecordings(presetIdx: number) {
    setRecLoading(true)
    const preset = DURATION_PRESETS[presetIdx]
    const params = new URLSearchParams()
    if (preset.min > 0) params.set('min_duration', String(preset.min))
    if (preset.max !== null) params.set('max_duration', String(preset.max))
    const res = await fetch(`/api/admin/call-recordings?${params}`)
    const data = await res.json()
    setCallRecordings(Array.isArray(data) ? data : [])
    setRecLoading(false)
  }

  function handleAgentFilter(id: string) {
    setFilterAgent(id)
    loadCalls(id)
  }

  function handleDurationPreset(idx: number) {
    setDurationPreset(idx)
    loadCallRecordings(idx)
  }

  // Load call recordings when switching to that tab
  useEffect(() => {
    if (tab === 'callrecordings' && callRecordings.length === 0 && !recLoading) {
      loadCallRecordings(0)
    }
  }, [tab])

  if (!agent) return null

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-5">Call Center</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {([
          { key: 'history', label: 'Call History' },
          { key: 'voicemails', label: 'Voicemails' },
          { key: 'callrecordings', label: 'Call Recordings' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Call History */}
      {tab === 'history' && (
        <div className="space-y-4">
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
                <EditableCall key={call.id} call={call} onSaved={() => loadCalls(filterAgent)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Voicemails */}
      {tab === 'voicemails' && (
        <div className="space-y-2">
          {recordings.length === 0 ? (
            <p className="text-gray-600 text-sm">No voicemails yet</p>
          ) : (
            recordings.map(rec => (
              <div key={rec.id} className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                <div className="flex items-center gap-3">
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
                </div>
                <div className="pl-11">
                  <AudioPlayer url={rec.recording_url} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Call Recordings */}
      {tab === 'callrecordings' && (
        <div className="space-y-4">
          {/* Duration filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 text-sm">Duration:</span>
            {DURATION_PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => handleDurationPreset(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  durationPreset === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="text-gray-600 text-sm ml-2">{callRecordings.length} recordings</span>
          </div>

          {recLoading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : callRecordings.length === 0 ? (
            <p className="text-gray-600 text-sm">No recordings found</p>
          ) : (
            <div className="space-y-2">
              {callRecordings.map(rec => (
                <div key={rec.id} className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className={`p-2 rounded-full shrink-0 ${rec.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                      {rec.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {rec.direction === 'inbound' ? rec.from_number : rec.to_number}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {rec.agents?.name || 'Unknown agent'} · {new Date(rec.started_at).toLocaleString()}
                      </p>
                    </div>
                    {rec.duration_seconds != null && (
                      <div className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                        <Clock className="w-3 h-3" />
                        {fmt(rec.duration_seconds)}
                      </div>
                    )}
                    <span className="shrink-0 p-1.5 rounded-full bg-blue-900/40 text-blue-400">
                      <MicVocal className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="pl-11">
                    <AudioPlayer url={rec.recording_url} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
