'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Copy, Check, ExternalLink, CalendarDays } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

type WeeklyHours = Record<string, [string, string][]>

interface BookingPageRow {
  id: string
  calendar_id: string
  slug: string
  title: string
  description: string | null
  event_type: string
  duration_minutes: number
  buffer_minutes: number
  min_notice_minutes: number
  max_days_ahead: number
  timezone: string
  weekly_hours: WeeklyHours
  enabled: boolean
}

interface CalendarRow {
  id: string
  name: string
  color: string
  type: 'personal' | 'team'
  members: string[]
  page: BookingPageRow | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
const MEETING_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'discovery', label: 'Discovery call' },
  { value: 'in_person', label: 'In person' },
  { value: 'callback', label: 'Callback' },
]
const inputCls = 'bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'
const labelCls = 'text-gray-500 text-[10px] uppercase tracking-widest block mb-1'

export default function BookingPagesAdmin() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [calendars, setCalendars] = useState<CalendarRow[]>([])
  const [tenantSlug, setTenantSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!agent) return
    fetch(`/api/admin/booking-pages?agent_id=${agent.id}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Could not load')
        setCalendars(d.calendars)
        setTenantSlug(d.tenant?.slug ?? '')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    if (agent.role !== 'admin' && !agent.is_platform_admin) { router.push('/dashboard'); return }
    load()
  }, [agent, agentLoading, router, load])

  if (!agent) return null

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Booking Pages</h1>
      <p className="text-gray-400 text-sm mt-0.5 mb-6">Public links people use to book time on a calendar. Bookings land on that calendar and create a lead.</p>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading ? <p className="text-gray-500 text-sm">Loading…</p> : (
        <div className="space-y-4">
          {calendars.map(c => <CalendarCard key={c.id} cal={c} tenantSlug={tenantSlug} agentId={agent.id} onSaved={load} />)}
          {calendars.length === 0 && <p className="text-gray-600 text-sm">No calendars yet — create one under Admin → Calendars.</p>}
        </div>
      )}
    </div>
  )
}

function CalendarCard({ cal, tenantSlug, agentId, onSaved }: { cal: CalendarRow; tenantSlug: string; agentId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const page = cal.page
  const url = page && typeof window !== 'undefined' ? `${window.location.origin}/book/${tenantSlug}/${page.slug}` : ''

  async function save(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    const r = await fetch('/api/admin/booking-pages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, calendar_id: cal.id, ...body }),
    }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setBusy(false)
    if (!r?.ok) { setError(d?.error || 'Could not save'); return false }
    onSaved()
    return true
  }

  function copy() {
    navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: cal.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold">{cal.name}</p>
          <p className="text-gray-500 text-xs">{cal.type === 'team' ? `Team · ${cal.members.join(', ')} — everyone must be free` : 'Personal'}</p>
        </div>
        {!page ? (
          <button onClick={() => save({})} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg">
            <Link2 className="w-3.5 h-3.5" /> Create booking page
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${page.enabled ? 'bg-emerald-900/60 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>{page.enabled ? 'Live' : 'Off'}</span>
            <button onClick={() => setEditing(e => !e)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded-lg">{editing ? 'Close' : 'Edit'}</button>
          </div>
        )}
      </div>

      {page && (
        <div className="mt-3 flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2 text-sm">
          <span className="text-gray-300 truncate flex-1">{url}</span>
          <button onClick={copy} title="Copy link" className="text-gray-400 hover:text-white">{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}</button>
          <a href={url} target="_blank" rel="noreferrer" title="Open" className="text-gray-400 hover:text-white"><ExternalLink className="w-4 h-4" /></a>
        </div>
      )}
      {page && !editing && (
        <p className="text-gray-500 text-xs mt-2 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />
          {page.duration_minutes} min · {Object.keys(page.weekly_hours).sort().map(d => DAYS[Number(d)]).join(', ') || 'no days set'} · {page.timezone.replace('America/', '').replace(/_/g, ' ')}
        </p>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {page && editing && <PageEditor page={page} busy={busy} onSave={async b => { if (await save(b)) setEditing(false) }} />}
    </div>
  )
}

function PageEditor({ page, busy, onSave }: { page: BookingPageRow; busy: boolean; onSave: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    title: page.title,
    slug: page.slug,
    description: page.description ?? '',
    event_type: page.event_type,
    duration_minutes: page.duration_minutes,
    buffer_minutes: page.buffer_minutes,
    min_notice_hours: Math.round(page.min_notice_minutes / 60),
    max_days_ahead: page.max_days_ahead,
    timezone: page.timezone,
    enabled: page.enabled,
  })
  const [hours, setHours] = useState<WeeklyHours>(page.weekly_hours)

  function toggleDay(d: number) {
    setHours(h => {
      const next = { ...h }
      if (next[String(d)]?.length) delete next[String(d)]
      else next[String(d)] = [['09:00', '17:00']]
      return next
    })
  }
  function setTime(d: number, idx: 0 | 1, v: string) {
    setHours(h => {
      const w = [...(h[String(d)]?.[0] ?? ['09:00', '17:00'])] as [string, string]
      w[idx] = v
      return { ...h, [String(d)]: [w] }
    })
  }

  return (
    <div className="mt-4 border-t border-gray-700 pt-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className={labelCls}>Page title</label><input className={`${inputCls} w-full`} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div><label className={labelCls}>Link name</label><input className={`${inputCls} w-full`} value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} /></div>
      </div>
      <div><label className={labelCls}>Description (shown to bookers)</label><textarea rows={2} className={`${inputCls} w-full resize-none`} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div><label className={labelCls}>Meeting type</label>
          <select className={inputCls} value={f.event_type} onChange={e => setF({ ...f, event_type: e.target.value })}>{MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div><label className={labelCls}>Length</label>
          <select className={inputCls} value={f.duration_minutes} onChange={e => setF({ ...f, duration_minutes: Number(e.target.value) })}>{[15, 20, 30, 45, 60, 90].map(m => <option key={m} value={m}>{m} min</option>)}</select></div>
        <div><label className={labelCls}>Buffer between</label>
          <select className={inputCls} value={f.buffer_minutes} onChange={e => setF({ ...f, buffer_minutes: Number(e.target.value) })}>{[0, 5, 10, 15, 30].map(m => <option key={m} value={m}>{m ? `${m} min` : 'None'}</option>)}</select></div>
        <div><label className={labelCls}>Time zone</label>
          <select className={inputCls} value={f.timezone} onChange={e => setF({ ...f, timezone: e.target.value })}>{TIMEZONES.map(z => <option key={z} value={z}>{z.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>)}</select></div>
        <div><label className={labelCls}>Minimum notice</label>
          <select className={inputCls} value={f.min_notice_hours} onChange={e => setF({ ...f, min_notice_hours: Number(e.target.value) })}>{[0, 1, 2, 4, 12, 24, 48].map(h => <option key={h} value={h}>{h ? `${h} hr` : 'None'}</option>)}</select></div>
        <div><label className={labelCls}>Book up to</label>
          <select className={inputCls} value={f.max_days_ahead} onChange={e => setF({ ...f, max_days_ahead: Number(e.target.value) })}>{[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days ahead</option>)}</select></div>
      </div>
      <div>
        <label className={labelCls}>Available hours</label>
        <div className="space-y-1.5">
          {DAYS.map((name, d) => {
            const w = hours[String(d)]?.[0]
            return (
              <div key={d} className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2 w-20 text-gray-200"><input type="checkbox" checked={!!w} onChange={() => toggleDay(d)} /> {name}</label>
                {w ? (
                  <>
                    <input type="time" step={900} className={`${inputCls} py-1`} value={w[0]} onChange={e => setTime(d, 0, e.target.value)} />
                    <span className="text-gray-500">to</span>
                    <input type="time" step={900} className={`${inputCls} py-1`} value={w[1]} onChange={e => setTime(d, 1, e.target.value)} />
                  </>
                ) : <span className="text-gray-600">Unavailable</span>}
              </div>
            )
          })}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" checked={f.enabled} onChange={e => setF({ ...f, enabled: e.target.checked })} /> Page is live (anyone with the link can book)</label>
      <button
        disabled={busy}
        onClick={() => onSave({
          title: f.title, slug: f.slug, description: f.description, event_type: f.event_type,
          duration_minutes: f.duration_minutes, buffer_minutes: f.buffer_minutes,
          min_notice_minutes: f.min_notice_hours * 60, max_days_ahead: f.max_days_ahead,
          timezone: f.timezone, weekly_hours: hours, enabled: f.enabled,
        })}
        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
