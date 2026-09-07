'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, PhoneIncoming, PhoneOutgoing, Headphones } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

function fmtAvg(secs: number | null) {
  if (secs === null) return '—'
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

interface AgentStatus {
  id: string
  name: string
  email: string
  status: 'available' | 'busy' | 'offline'
  activeCall: {
    direction: 'inbound' | 'outbound'
    remoteNumber: string
    status: string
    started_at: string
    telnyx_call_control_id: string | null
  } | null
  callsToday:      number
  outboundToday:   number
  inboundToday:    number
  avgTalkOutbound: number | null
  avgTalkInbound:  number | null
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; text: string }> = {
  available: { dot: 'bg-green-500',  label: 'Available', text: 'text-green-400'  },
  busy:      { dot: 'bg-yellow-500', label: 'Busy',      text: 'text-yellow-400' },
  offline:   { dot: 'bg-gray-500',   label: 'Offline',   text: 'text-gray-500'   },
}

function CallTimer({ startedAt }: { startedAt: string }) {
  const [secs, setSecs] = useState(
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  )
  useEffect(() => {
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return <>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</>
}

export default function MonitorPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [barging, setBarging] = useState<string | null>(null) // agent id being barged
  const [bargeError, setBargeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!agent) return
    const res = await fetch(`/api/admin/monitor?agent_id=${agent.id}`)
    const data = await res.json()
    if (Array.isArray(data)) setAgents(data)
  }, [agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [agent, agentLoading, router, load])

  async function bargeCall(targetAgent: AgentStatus) {
    if (!targetAgent.activeCall?.telnyx_call_control_id) {
      setBargeError('No call control ID — only inbound calls support monitoring right now.')
      setTimeout(() => setBargeError(null), 4000)
      return
    }
    setBarging(targetAgent.id)
    setBargeError(null)
    const res = await fetch('/api/admin/barge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call_control_id: targetAgent.activeCall.telnyx_call_control_id,
        admin_sip_username: agent!.sip_username,
      }),
    })
    const data = await res.json()
    setBarging(null)
    if (data.error) {
      setBargeError(data.error)
      setTimeout(() => setBargeError(null), 5000)
    }
  }

  if (!agent) return null

  const onCall = agents.filter(a => a.activeCall)
  const available = agents.filter(a => !a.activeCall && a.status === 'available')
  const offline = agents.filter(a => !a.activeCall && a.status !== 'available')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Live Monitor</h1>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          Live · refreshes every 5s · build 20260525-C
        </div>
      </div>

      {bargeError && (
        <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg">
          {bargeError}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex gap-4 mb-6">
        {[
          { label: 'On Call', value: onCall.length, color: 'text-blue-400' },
          { label: 'Available', value: available.length, color: 'text-green-400' },
          { label: 'Offline', value: offline.length, color: 'text-gray-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700 min-w-[90px] text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-gray-500 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(a => {
          const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.offline
          const isOnCall = !!a.activeCall
          return (
            <div
              key={a.id}
              className={`bg-gray-800 rounded-xl p-5 border transition-colors ${
                isOnCall ? 'border-blue-600' : 'border-gray-700'
              }`}
            >
              {/* Agent header */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{a.name}</p>
                  <p className="text-gray-500 text-xs truncate">{a.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot} ${isOnCall ? 'animate-pulse' : ''}`} />
                  <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
                </div>
              </div>

              {/* Active call card */}
              {isOnCall ? (
                <div className="bg-gray-900/70 rounded-lg px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {a.activeCall!.direction === 'inbound'
                      ? <PhoneIncoming className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      : <PhoneOutgoing className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    <span className="text-white text-sm font-mono truncate">{a.activeCall!.remoteNumber}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 capitalize">{a.activeCall!.status}</span>
                    <span className="text-gray-400 font-mono">
                      <CallTimer startedAt={a.activeCall!.started_at} />
                    </span>
                  </div>
                  <button
                    onClick={() => bargeCall(a)}
                    disabled={barging === a.id}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    {barging === a.id ? 'Connecting…' : 'Monitor'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-gray-600 text-xs">
                  <Phone className="w-3 h-3" />
                  No active call
                </div>
              )}

              {/* Today's call stats */}
              <div className="mt-3 pt-3 border-t border-gray-700/60 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><PhoneOutgoing className="w-3 h-3" /> Out</span>
                  <span className="text-gray-300 font-medium">{a.outboundToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1"><PhoneIncoming className="w-3 h-3" /> In</span>
                  <span className="text-gray-300 font-medium">{a.inboundToday}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Avg out</span>
                  <span className="text-gray-400 font-mono">{fmtAvg(a.avgTalkOutbound)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Avg in</span>
                  <span className="text-gray-400 font-mono">{fmtAvg(a.avgTalkInbound)}</span>
                </div>
              </div>
            </div>
          )
        })}

        {agents.length === 0 && (
          <p className="text-gray-600 text-sm">Loading...</p>
        )}
      </div>
    </div>
  )
}
