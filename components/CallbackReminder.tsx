'use client'

import { useEffect, useState, useCallback } from 'react'
import { Phone, X, Bell, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Callback {
  id: string
  lead_phone: string
  lead_name: string | null
  scheduled_at: string
  notes: string | null
  status: string
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

export default function CallbackReminder() {
  const { agent, makeCall, activeCall } = useSoftphone()
  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(() => {
    if (!agent) return
    fetch(`/api/callbacks?agent_id=${agent.id}&status=pending`)
      .then(r => r.json())
      .then(d => setCallbacks(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [agent])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  async function markDone(id: string) {
    await fetch('/api/callbacks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    }).catch(() => {})
    setCallbacks(prev => prev.filter(c => c.id !== id))
  }

  function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]))
  }

  // Split into overdue/due-soon (alert) vs upcoming
  const now = Date.now()
  const alertThreshold = now + 15 * 60 * 1000 // 15 min window
  const alertItems = callbacks.filter(c => !dismissed.has(c.id) && new Date(c.scheduled_at).getTime() <= alertThreshold)
  const upcomingItems = callbacks.filter(c => !dismissed.has(c.id) && new Date(c.scheduled_at).getTime() > alertThreshold)
  const visible = [...alertItems, ...(expanded ? upcomingItems : [])]

  if (callbacks.filter(c => !dismissed.has(c.id)).length === 0) return null

  const overdue = alertItems.filter(c => new Date(c.scheduled_at).getTime() < now)
  const total = callbacks.filter(c => !dismissed.has(c.id)).length

  return (
    <div className="fixed bottom-6 left-6 z-40 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-4 py-3 cursor-pointer ${overdue.length > 0 ? 'bg-red-900/40 border-b border-red-800/40' : 'bg-gray-800 border-b border-gray-700'}`}
        onClick={() => setExpanded(e => !e)}
      >
        <Bell className={`w-4 h-4 ${overdue.length > 0 ? 'text-red-400' : 'text-blue-400'}`} />
        <span className="text-white text-sm font-medium flex-1">
          {overdue.length > 0 ? `${overdue.length} overdue callback${overdue.length !== 1 ? 's' : ''}` : `${alertItems.length} callback${alertItems.length !== 1 ? 's' : ''} due soon`}
        </span>
        {total > alertItems.length && (
          <span className="text-gray-400 text-xs">{total} total</span>
        )}
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Items */}
      <div className="max-h-72 overflow-y-auto">
        {visible.map(cb => {
          const isOverdue = new Date(cb.scheduled_at).getTime() < now
          return (
            <div key={cb.id} className={`px-4 py-3 border-b border-gray-800 last:border-0 ${isOverdue ? 'bg-red-950/20' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{cb.lead_name || cb.lead_phone}</p>
                  {cb.lead_name && <p className="text-gray-500 text-xs">{cb.lead_phone}</p>}
                  <p className={`text-xs font-medium mt-0.5 ${isOverdue ? 'text-red-400' : 'text-blue-400'}`}>
                    {timeLabel(cb.scheduled_at)} · {new Date(cb.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {cb.notes && <p className="text-gray-500 text-xs mt-1 truncate italic">"{cb.notes}"</p>}
                </div>
                <button onClick={() => dismiss(cb.id)} className="text-gray-600 hover:text-gray-400 shrink-0 mt-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    if (activeCall) return
                    const e164 = cb.lead_phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
                    makeCall(e164, { bypassCooldown: true })
                  }}
                  disabled={!!activeCall}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
                >
                  <Phone className="w-3 h-3" /> Call Now
                </button>
                <button
                  onClick={() => markDone(cb.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
                >
                  <Check className="w-3 h-3" /> Done
                </button>
              </div>
            </div>
          )
        })}

        {!expanded && upcomingItems.length > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full px-4 py-2.5 text-gray-400 text-xs hover:text-white transition-colors text-center"
          >
            +{upcomingItems.length} upcoming callback{upcomingItems.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  )
}
