'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Check, Trash2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Callback {
  id: string
  lead_phone: string
  lead_name: string | null
  scheduled_at: string
  notes: string | null
  status: string
  created_at: string
}

function timeLabel(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  const mins = Math.round(diff / 60000)
  if (mins < -1440) return `${Math.round(-diff / 86400000)}d overdue`
  if (mins < -60) return `${Math.round(-mins / 60)}h overdue`
  if (mins < 0) return `${-mins}m overdue`
  if (mins < 60) return `in ${mins}m`
  if (mins < 1440) return `in ${Math.round(mins / 60)}h`
  return `in ${Math.round(mins / 1440)}d`
}

export default function CallbacksPage() {
  const { agent, agentLoading, makeCall, activeCall } = useSoftphone()
  const router = useRouter()
  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'completed' | 'all'>('pending')
  const [showCompleted, setShowCompleted] = useState(false)

  const load = useCallback(() => {
    if (!agent) return
    const params = new URLSearchParams({ agent_id: agent.id, status: statusFilter === 'all' ? 'all' : statusFilter })
    fetch(`/api/callbacks?${params}`)
      .then(r => r.json())
      .then(d => { setCallbacks(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [agent, statusFilter])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
  }, [agent, agentLoading, router, load])

  async function markDone(id: string) {
    await fetch('/api/callbacks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    })
    setCallbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'completed' } : c))
  }

  async function deleteCallback(id: string) {
    await fetch('/api/callbacks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setCallbacks(prev => prev.filter(c => c.id !== id))
  }

  if (!agent) return null

  const now = Date.now()
  const pending = callbacks.filter(c => c.status === 'pending')
  const completed = callbacks.filter(c => c.status === 'completed')
  const overdue = pending.filter(c => new Date(c.scheduled_at).getTime() < now)
  const upcoming = pending.filter(c => new Date(c.scheduled_at).getTime() >= now)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My Callbacks</h1>
          <p className="text-gray-400 text-sm mt-0.5">{pending.length} pending · {overdue.length} overdue</p>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <section>
              <p className="text-red-400 text-xs font-semibold uppercase tracking-widest mb-3">Overdue</p>
              <div className="space-y-2">
                {overdue.map(cb => <CallbackCard key={cb.id} cb={cb} onDone={markDone} onDelete={deleteCallback} onCall={n => { if (!activeCall) { const e164 = n.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1'); makeCall(e164, { bypassCooldown: true }) } }} activeCall={!!activeCall} />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">Upcoming</p>
              <div className="space-y-2">
                {upcoming.map(cb => <CallbackCard key={cb.id} cb={cb} onDone={markDone} onDelete={deleteCallback} onCall={n => { if (!activeCall) { const e164 = n.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1'); makeCall(e164, { bypassCooldown: true }) } }} activeCall={!!activeCall} />)}
              </div>
            </section>
          )}

          {pending.length === 0 && (
            <p className="text-gray-600 text-sm">No pending callbacks.</p>
          )}

          {completed.length > 0 && (
            <section>
              <button
                onClick={() => setShowCompleted(e => !e)}
                className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-widest mb-3 hover:text-gray-300 transition-colors"
              >
                {showCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Completed ({completed.length})
              </button>
              {showCompleted && (
                <div className="space-y-2 opacity-60">
                  {completed.map(cb => <CallbackCard key={cb.id} cb={cb} onDone={markDone} onDelete={deleteCallback} onCall={() => {}} activeCall={!!activeCall} />)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function CallbackCard({ cb, onDone, onDelete, onCall, activeCall }: {
  cb: Callback
  onDone: (id: string) => void
  onDelete: (id: string) => void
  onCall: (phone: string) => void
  activeCall: boolean
}) {
  const now = Date.now()
  const isOverdue = cb.status === 'pending' && new Date(cb.scheduled_at).getTime() < now
  const isDone = cb.status === 'completed'

  return (
    <div className={`bg-gray-800 rounded-xl px-4 py-3 border ${isOverdue ? 'border-red-800/40' : 'border-gray-700'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">{cb.lead_name || cb.lead_phone}</p>
          {cb.lead_name && <p className="text-gray-500 text-xs">{cb.lead_phone}</p>}
          <p className={`text-xs mt-0.5 flex items-center gap-1 ${isOverdue ? 'text-red-400' : isDone ? 'text-gray-500' : 'text-blue-400'}`}>
            <Clock className="w-3 h-3" />
            {isDone ? 'Completed' : timeLabel(cb.scheduled_at)} · {new Date(cb.scheduled_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
          {cb.notes && <p className="text-gray-400 text-xs mt-1 italic">"{cb.notes}"</p>}
        </div>
        <button onClick={() => onDelete(cb.id)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {!isDone && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onCall(cb.lead_phone)}
            disabled={activeCall}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
          >
            <Phone className="w-3 h-3" /> Call Now
          </button>
          <button
            onClick={() => onDone(cb.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
          >
            <Check className="w-3 h-3" /> Mark Done
          </button>
        </div>
      )}
    </div>
  )
}
