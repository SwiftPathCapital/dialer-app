'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, Check, Trash2, ChevronLeft, ChevronRight, Plus, X, Clock,
} from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Callback {
  id: string
  lead_phone: string
  lead_name: string | null
  scheduled_at: string
  notes: string | null
  status: string
}

type ViewMode = 'day' | 'week' | 'month'

const DAY_START_HOUR = 7
const DAY_END_HOUR = 19

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfWeek(d: Date) {
  const out = new Date(d)
  out.setDate(out.getDate() - out.getDay())
  out.setHours(0, 0, 0, 0)
  return out
}

function dayOfYear(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1
}

function weekOfYear(d: Date) {
  return Math.ceil((dayOfYear(d) + startOfWeek(new Date(d.getFullYear(), 0, 1)).getDay()) / 7)
}

export default function CalendarPage() {
  const { agent, agentLoading, makeCall, activeCall } = useSoftphone()
  const router = useRouter()

  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [monthCursor, setMonthCursor] = useState(() => new Date())
  const [view, setView] = useState<ViewMode>('day')
  const [selectedEvent, setSelectedEvent] = useState<Callback | null>(null)
  const [newForm, setNewForm] = useState<{ time: string; phone: string; name: string; notes: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (!agent) return
    fetch(`/api/callbacks?agent_id=${agent.id}&status=all`)
      .then(r => r.json())
      .then(d => { setCallbacks(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
  }, [agent, agentLoading, router, load])

  const now = Date.now()
  const pending = useMemo(() => callbacks.filter(c => c.status === 'pending'), [callbacks])
  const completed = useMemo(() => callbacks.filter(c => c.status === 'completed'), [callbacks])
  const overdue = useMemo(() => pending.filter(c => new Date(c.scheduled_at).getTime() < now), [pending, now])

  const todayCount = useMemo(() => pending.filter(c => sameDay(new Date(c.scheduled_at), new Date())).length, [pending])
  const weekStart = useMemo(() => startOfWeek(new Date()), [])
  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d }, [weekStart])
  const thisWeekCount = useMemo(
    () => pending.filter(c => { const t = new Date(c.scheduled_at); return t >= weekStart && t < weekEnd }).length,
    [pending, weekStart, weekEnd]
  )
  const completedThisWeek = useMemo(
    () => completed.filter(c => { const t = new Date(c.scheduled_at); return t >= weekStart && t < weekEnd }).length,
    [completed, weekStart, weekEnd]
  )

  function callbacksOnDay(d: Date) {
    return callbacks
      .filter(c => sameDay(new Date(c.scheduled_at), d))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  }

  async function markDone(id: string) {
    await fetch('/api/callbacks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed' }),
    })
    setCallbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'completed' } : c))
    setSelectedEvent(prev => prev && prev.id === id ? { ...prev, status: 'completed' } : prev)
  }

  async function deleteCallback(id: string) {
    await fetch('/api/callbacks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setCallbacks(prev => prev.filter(c => c.id !== id))
    setSelectedEvent(prev => prev && prev.id === id ? null : prev)
  }

  function callNow(phone: string) {
    if (activeCall) return
    const e164 = phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
    makeCall(e164, { bypassCooldown: true })
  }

  function openNewFormAt(hour: number) {
    setNewForm({ time: `${String(hour).padStart(2, '0')}:00`, phone: '', name: '', notes: '' })
  }

  async function submitNewForm(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm || !agent || !newForm.phone.trim()) return
    setSaving(true)
    const [h, m] = newForm.time.split(':').map(Number)
    const scheduled = new Date(selectedDate)
    scheduled.setHours(h, m, 0, 0)
    const res = await fetch('/api/callbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_phone: newForm.phone.trim(),
        lead_name: newForm.name.trim() || null,
        agent_id: agent.id,
        scheduled_at: scheduled.toISOString(),
        notes: newForm.notes.trim() || null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setCallbacks(prev => [...prev, data])
      setNewForm(null)
    }
  }

  if (!agent) return null

  const dayList = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  const selectedDayEvents = callbacksOnDay(selectedDate)
  const selectedDayLabel = selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  const monthGridStart = startOfWeek(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1))
  const monthDays = Array.from({ length: 42 }).map((_, i) => {
    const d = new Date(monthGridStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfWeek(selectedDate))
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left rail — upcoming days */}
      <div className="w-64 shrink-0 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-white font-bold text-lg">Calendar</h1>
          <p className="text-gray-500 text-xs mt-0.5">{pending.length} pending · {overdue.length} overdue</p>
        </div>
        <div className="p-2 space-y-1">
          {dayList.map(d => {
            const isSelected = sameDay(d, selectedDate)
            const count = callbacksOnDay(d).filter(c => c.status === 'pending').length
            return (
              <button
                key={d.toISOString()}
                onClick={() => { setSelectedDate(d); setView('day'); setSelectedEvent(null) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                  isSelected ? 'bg-cyan-900/40 border border-cyan-500/40' : 'hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0 text-[10px] font-bold uppercase ${
                  sameDay(d, new Date()) ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400'
                }`}>
                  <span>{d.toLocaleDateString([], { weekday: 'short' }).slice(0, 1)}</span>
                  <span className="text-xs">{d.getDate()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">
                    {sameDay(d, new Date()) ? 'Today' : d.toLocaleDateString([], { weekday: 'long' })}
                  </p>
                  <p className="text-gray-500 text-xs">{count > 0 ? `${count} callback${count > 1 ? 's' : ''}` : 'Quiet day'}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected day summary card */}
        <div className="mt-auto p-4 border-t border-gray-800">
          <p className="text-4xl font-bold text-white">{selectedDate.getDate()}</p>
          <p className="text-cyan-400 text-xs uppercase tracking-widest mt-1">
            {selectedDate.toLocaleDateString([], { weekday: 'short' })} · {selectedDate.toLocaleDateString([], { month: 'short' })}
          </p>
          <p className="text-gray-600 text-xs mt-1">Day {dayOfYear(selectedDate)} of {selectedDate.getFullYear()} · Week {weekOfYear(selectedDate)}</p>
          <div className="flex gap-2 mt-3">
            <span className="text-xs bg-gray-800 text-gray-300 rounded-full px-2.5 py-1">{selectedDayEvents.length} events</span>
            <span className="text-xs bg-gray-800 text-gray-300 rounded-full px-2.5 py-1">
              {selectedDayEvents.filter(c => c.status === 'pending' && new Date(c.scheduled_at).getTime() < now).length} overdue
            </span>
          </div>
        </div>
      </div>

      {/* Center panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white text-xl font-bold">{selectedDayLabel}</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {selectedDayEvents.length === 0 ? 'Quiet day' : `${selectedDayEvents.length} scheduled`} · click any empty hour to create
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['day', 'week', 'month'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                    view === v ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={() => openNewFormAt(new Date().getHours())}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-opacity"
            >
              <Plus className="w-4 h-4" /> New Callback
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : view === 'day' ? (
            <div className="space-y-0.5">
              {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }).map((_, i) => {
                const hour = DAY_START_HOUR + i
                const hourEvents = selectedDayEvents.filter(c => new Date(c.scheduled_at).getHours() === hour)
                return (
                  <div key={hour} className="flex gap-4 border-t border-gray-800/60 min-h-[56px]">
                    <div className="w-16 shrink-0 text-gray-600 text-xs pt-2">
                      {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </div>
                    <button
                      onClick={() => openNewFormAt(hour)}
                      className="flex-1 py-2 flex flex-wrap gap-2 items-start text-left hover:bg-gray-900/40 rounded-lg transition-colors"
                    >
                      {hourEvents.length === 0 ? (
                        <span className="text-gray-800 text-xs self-center">&nbsp;</span>
                      ) : hourEvents.map(cb => (
                        <div
                          key={cb.id}
                          onClick={e => { e.stopPropagation(); setSelectedEvent(cb) }}
                          className={`px-3 py-2 rounded-lg text-xs cursor-pointer border ${
                            cb.status === 'completed'
                              ? 'bg-gray-800/60 border-gray-700 text-gray-500'
                              : new Date(cb.scheduled_at).getTime() < now
                              ? 'bg-red-950/50 border-red-800/50 text-red-300'
                              : 'bg-cyan-950/50 border-cyan-700/50 text-cyan-200'
                          }`}
                        >
                          <p className="font-medium">{cb.lead_name || cb.lead_phone}</p>
                          <p className="opacity-70">{new Date(cb.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                      ))}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : view === 'week' ? (
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(d => {
                const events = callbacksOnDay(d)
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => { setSelectedDate(d); setView('day') }}
                    className={`text-left rounded-xl border p-3 min-h-[140px] transition-colors ${
                      sameDay(d, selectedDate) ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <p className="text-gray-500 text-[10px] uppercase tracking-widest">{d.toLocaleDateString([], { weekday: 'short' })}</p>
                    <p className={`text-lg font-bold ${sameDay(d, new Date()) ? 'text-cyan-400' : 'text-white'}`}>{d.getDate()}</p>
                    <p className="text-gray-600 text-xs mt-1">{events.length} evts</p>
                    <div className="mt-2 space-y-1">
                      {events.slice(0, 3).map(cb => (
                        <p key={cb.id} className="text-[10px] truncate text-gray-400">
                          {new Date(cb.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} {cb.lead_name || cb.lead_phone}
                        </p>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="text-gray-500 hover:text-white">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <p className="text-white font-semibold">{monthCursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}</p>
                <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="text-gray-500 hover:text-white">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-gray-600 text-[10px] uppercase mb-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map(d => {
                  const inMonth = d.getMonth() === monthCursor.getMonth()
                  const events = callbacksOnDay(d)
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => { setSelectedDate(d); setView('day') }}
                      className={`aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-start transition-colors ${
                        sameDay(d, selectedDate) ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-gray-800 hover:border-gray-700'
                      } ${!inMonth ? 'opacity-30' : ''}`}
                    >
                      <span className={`text-xs ${sameDay(d, new Date()) ? 'text-cyan-400 font-bold' : 'text-gray-300'}`}>{d.getDate()}</span>
                      {events.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — stats + selected event */}
      <div className="w-72 shrink-0 border-l border-gray-800 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Today" value={todayCount} color="cyan" />
          <StatTile label="This Week" value={thisWeekCount} color="purple" />
          <StatTile label="Overdue" value={overdue.length} color="pink" />
          <StatTile label="Done This Wk" value={completedThisWeek} color="teal" />
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">Selected</p>
          {!selectedEvent ? (
            <p className="text-gray-600 text-sm">No event selected.</p>
          ) : (
            <div>
              <p className="text-white text-sm font-medium">{selectedEvent.lead_name || selectedEvent.lead_phone}</p>
              {selectedEvent.lead_name && <p className="text-gray-500 text-xs">{selectedEvent.lead_phone}</p>}
              <p className="text-cyan-400 text-xs mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(selectedEvent.scheduled_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
              {selectedEvent.notes && <p className="text-gray-400 text-xs mt-2 italic">"{selectedEvent.notes}"</p>}
              {selectedEvent.status !== 'completed' ? (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => callNow(selectedEvent.lead_phone)}
                    disabled={!!activeCall}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
                  >
                    <Phone className="w-3 h-3" /> Call
                  </button>
                  <button
                    onClick={() => markDone(selectedEvent.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
                  >
                    <Check className="w-3 h-3" /> Done
                  </button>
                  <button
                    onClick={() => deleteCallback(selectedEvent.id)}
                    className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-800 hover:bg-red-900/50 text-gray-500 hover:text-red-400 text-xs rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <p className="text-gray-600 text-xs mt-3">Completed</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New callback modal */}
      {newForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form onSubmit={submitNewForm} className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">New Callback — {selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}</h3>
              <button type="button" onClick={() => setNewForm(null)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newForm.phone}
                onChange={e => setNewForm({ ...newForm, phone: e.target.value })}
                placeholder="Phone number"
                required
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
              />
              <input
                value={newForm.name}
                onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                placeholder="Name (optional)"
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
              />
              <input
                type="time"
                value={newForm.time}
                onChange={e => setNewForm({ ...newForm, time: e.target.value })}
                required
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <textarea
                value={newForm.notes}
                onChange={e => setNewForm({ ...newForm, notes: e.target.value })}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !newForm.phone.trim()}
              className="w-full mt-4 py-2.5 bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 disabled:opacity-40 text-white font-semibold text-sm rounded-lg transition-opacity"
            >
              {saving ? 'Saving…' : 'Schedule Callback'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, color }: { label: string; value: number; color: 'cyan' | 'purple' | 'pink' | 'teal' }) {
  const colors: Record<string, string> = {
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-950/20',
    purple: 'text-purple-400 border-purple-500/20 bg-purple-950/20',
    pink: 'text-pink-400 border-pink-500/20 bg-pink-950/20',
    teal: 'text-teal-400 border-teal-500/20 bg-teal-950/20',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-400 text-[10px] uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  )
}
