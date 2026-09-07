'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Callback {
  id: string
  lead_phone: string
  lead_name: string | null
  scheduled_at: string
  notes: string | null
  status: string
  created_at: string
  agents: { id: string; name: string } | null
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

export default function AdminCallbacksPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAgent, setFilterAgent] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  const load = useCallback(() => {
    if (!agent) return
    const params = new URLSearchParams({ all: 'true', status: 'all', requester_id: agent.id })
    if (filterAgent) params.set('agent_id', filterAgent)
    fetch(`/api/callbacks?${params}`)
      .then(r => r.json())
      .then(d => { setCallbacks(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filterAgent, agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent || agent.role !== 'admin') { router.push('/dashboard'); return }
    fetch(`/api/agents?agent_id=${agent.id}`).then(r => r.json()).then(d => setAgents(Array.isArray(d) ? d : []))
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
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Callbacks</h1>
          <p className="text-gray-400 text-sm mt-0.5">{pending.length} pending · {overdue.length} overdue</p>
        </div>
        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500"
        >
          <option value="">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <section>
              <p className="text-red-400 text-xs font-semibold uppercase tracking-widest mb-3">Overdue</p>
              <div className="space-y-2">
                {overdue.map(cb => <AdminCallbackCard key={cb.id} cb={cb} onDone={markDone} onDelete={deleteCallback} />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">Upcoming</p>
              <div className="space-y-2">
                {upcoming.map(cb => <AdminCallbackCard key={cb.id} cb={cb} onDone={markDone} onDelete={deleteCallback} />)}
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
                  {completed.map(cb => <AdminCallbackCard key={cb.id} cb={cb} onDone={markDone} onDelete={deleteCallback} />)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function AdminCallbackCard({ cb, onDone, onDelete }: {
  cb: Callback
  onDone: (id: string) => void
  onDelete: (id: string) => void
}) {
  const now = Date.now()
  const isOverdue = cb.status === 'pending' && new Date(cb.scheduled_at).getTime() < now
  const isDone = cb.status === 'completed'

  return (
    <div className={`bg-gray-800 rounded-xl px-4 py-3 border ${isOverdue ? 'border-red-800/40' : 'border-gray-700'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white text-sm font-medium">{cb.lead_name || cb.lead_phone}</p>
            {cb.agents && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{cb.agents.name}</span>
            )}
          </div>
          {cb.lead_name && <p className="text-gray-500 text-xs">{cb.lead_phone}</p>}
          <p className={`text-xs mt-0.5 flex items-center gap-1 ${isOverdue ? 'text-red-400' : isDone ? 'text-gray-500' : 'text-blue-400'}`}>
            <Clock className="w-3 h-3" />
            {isDone ? 'Completed' : timeLabel(cb.scheduled_at)} · {new Date(cb.scheduled_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
          {cb.notes && <p className="text-gray-400 text-xs mt-1 italic">"{cb.notes}"</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isDone && (
            <button onClick={() => onDone(cb.id)} title="Mark done" className="text-gray-500 hover:text-green-400 transition-colors">
              <Check className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => onDelete(cb.id)} title="Delete" className="text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
