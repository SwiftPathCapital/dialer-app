'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneIncoming, PhoneOutgoing, Clock, ChevronDown, ChevronUp } from 'lucide-react'
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
}

const DISPO_COLORS: Record<string, string> = {
  'Interested':         'bg-green-900/40 text-green-300',
  'Callback':           'bg-blue-900/40 text-blue-300',
  'App Received':       'bg-teal-900/40 text-teal-300',
  'Docs Received':      'bg-indigo-900/40 text-indigo-300',
  'Pending App & Docs': 'bg-amber-900/40 text-amber-300',
  'Deal Funded':        'bg-emerald-900/40 text-emerald-300',
  'Not Interested':     'bg-red-900/40 text-red-300',
  'No Answer':          'bg-gray-700 text-gray-400',
  'Left Voicemail':     'bg-purple-900/40 text-purple-300',
  'Wrong Number':       'bg-yellow-900/40 text-yellow-300',
  'DNC':                'bg-orange-900/40 text-orange-300',
}

const RANGES = [
  { label: 'Today',      days: 0 },
  { label: 'Yesterday',  days: 1 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
]

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function fmtTotal(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export default function CallLogPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rangeIdx, setRangeIdx] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load(rangeIdx)
  }, [agent, agentLoading, router])

  async function load(idx: number) {
    if (!agent) return
    setLoading(true)
    const range = RANGES[idx]
    const now = new Date()
    let dateFrom: string
    let dateTo: string

    if (range.days === 0) {
      // Today: midnight to now
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      dateFrom = start.toISOString()
      dateTo = now.toISOString()
    } else if (range.days === 1) {
      // Yesterday: midnight to midnight
      const start = new Date(now)
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(now)
      end.setHours(0, 0, 0, 0)
      dateFrom = start.toISOString()
      dateTo = end.toISOString()
    } else {
      const start = new Date(now)
      start.setDate(start.getDate() - range.days)
      start.setHours(0, 0, 0, 0)
      dateFrom = start.toISOString()
      dateTo = now.toISOString()
    }

    const params = new URLSearchParams({
      agent_id: agent.id,
      date_from: dateFrom,
      date_to: dateTo,
      limit: '500',
    })
    const res = await fetch(`/api/calls?${params}`)
    const data = await res.json()
    setCalls(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function switchRange(idx: number) {
    setRangeIdx(idx)
    load(idx)
  }

  if (!agent) return null

  const answered = calls.filter(c => c.status === 'completed' && (c.duration_seconds ?? 0) > 0)
  const totalTalk = answered.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0)
  const outbound = calls.filter(c => c.direction === 'outbound')
  const inbound = calls.filter(c => c.direction === 'inbound')

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">My Call Log</h1>
        <p className="text-gray-400 text-sm mt-0.5">{agent.name}</p>
      </div>

      {/* Range filter */}
      <div className="flex gap-1 mb-5 bg-gray-800 rounded-lg p-1 w-fit border border-gray-700">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => switchRange(i)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              rangeIdx === i ? 'neon-chase bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
            style={rangeIdx === i ? ({ '--glow-color': '#3b82f6' } as React.CSSProperties) : undefined}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Calls', value: calls.length },
            { label: 'Outbound', value: outbound.length },
            { label: 'Inbound', value: inbound.length },
            { label: 'Talk Time', value: fmtTotal(totalTalk) },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-xl border border-gray-700 px-4 py-3">
              <p className="text-gray-500 text-xs uppercase tracking-widest">{s.label}</p>
              <p className="text-white text-xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Call list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 h-16 animate-pulse" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <p className="text-gray-600 text-sm">No calls in this period.</p>
      ) : (
        <div className="space-y-2">
          {calls.map(call => {
            const remote = call.direction === 'inbound' ? call.from_number : call.to_number
            const expanded = expandedId === call.id
            const hasExtra = !!(call.notes || call.disposition)

            return (
              <div
                key={call.id}
                className={`bg-gray-800 rounded-xl border overflow-hidden transition-colors ${
                  hasExtra ? 'cursor-pointer hover:border-gray-500' : ''
                } border-gray-700`}
                onClick={() => hasExtra && setExpandedId(expanded ? null : call.id)}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className={`p-2 rounded-full shrink-0 ${
                    call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'
                  }`}>
                    {call.direction === 'inbound'
                      ? <PhoneIncoming className="w-4 h-4" />
                      : <PhoneOutgoing className="w-4 h-4" />}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium font-mono">{remote}</p>
                      {call.disposition && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${DISPO_COLORS[call.disposition] || 'bg-gray-700 text-gray-300'}`}>
                          {call.disposition}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {new Date(call.started_at).toLocaleString([], {
                        month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                      {' · '}
                      <span className={call.status === 'completed' ? 'text-green-500' : 'text-gray-600'}>
                        {call.status}
                      </span>
                    </p>
                  </div>

                  {call.duration_seconds != null && call.duration_seconds > 0 && (
                    <div className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                      <Clock className="w-3 h-3" />
                      {fmt(call.duration_seconds)}
                    </div>
                  )}

                  {hasExtra && (
                    <span className="text-gray-600 shrink-0">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  )}
                </div>

                {expanded && (
                  <div className="border-t border-gray-700 px-4 py-3 pl-14 space-y-1">
                    {call.notes && (
                      <p className="text-gray-400 text-sm italic">"{call.notes}"</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
