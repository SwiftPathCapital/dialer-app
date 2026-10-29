'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CalendarDays, Clock, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Globe } from 'lucide-react'

interface PageInfo {
  title: string
  description: string | null
  duration_minutes: number
  timezone: string
  business: string
  hosts: string[]
}

const visitorTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: visitorTz }) // YYYY-MM-DD in the visitor's zone
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: visitorTz })
}

function fmtLong(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: visitorTz, timeZoneName: 'short' })
}

export default function BookingPage() {
  const params = useParams<{ tenant: string; slug: string }>()
  const apiUrl = `/api/book/${encodeURIComponent(params.tenant)}/${encodeURIComponent(params.slug)}`

  const [info, setInfo] = useState<PageInfo | null>(null)
  const [slots, setSlots] = useState<string[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '', website: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(apiUrl, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load this page')
      setInfo(d.page)
      setSlots(d.slots)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this page')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [apiUrl]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (info) document.title = `${info.title} · ${info.business}` }, [info])

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of slots) {
      const k = dayKey(s)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return m
  }, [slots])
  const days = [...byDay.keys()]
  const visibleDays = days.slice(weekStart, weekStart + 7)

  useEffect(() => { if (!day && days.length) setDay(days[0]) }, [days, day])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!chosen) return
    setSubmitting(true)
    setError('')
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, start: chosen }),
    }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setSubmitting(false)
    if (!r?.ok) {
      setError(d?.error || 'Something went wrong. Please try again.')
      if (r?.status === 409) { setChosen(null); load() }
      return
    }
    setBooked(d.start)
  }

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950">
      <div className="min-h-full flex items-start md:items-center justify-center px-4 py-10">
        <div className="w-full max-w-3xl">{children}</div>
      </div>
    </div>
  )

  if (loading && !info) return shell(<p className="text-slate-400 text-center flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>)
  if (loadError || !info) return shell(<p className="text-slate-300 text-center">{loadError || 'This booking page isn\'t available.'}</p>)

  const header = (
    <div className="mb-6">
      <p className="text-cyan-300 text-sm font-medium">{info.business}</p>
      <h1 className="text-white text-2xl md:text-3xl font-bold mt-1">{info.title}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-slate-400">
        <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {info.duration_minutes} minutes</span>
        {info.hosts.length > 0 && <span>With {info.hosts.join(' & ')}</span>}
        <span className="flex items-center gap-1.5"><Globe className="w-4 h-4" /> Times shown in {visitorTz.replace(/_/g, ' ')}</span>
      </div>
      {info.description && <p className="text-slate-300 text-sm mt-4 whitespace-pre-wrap">{info.description}</p>}
    </div>
  )

  if (booked) {
    return shell(
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
        <h1 className="text-white text-2xl font-bold mt-4">You&apos;re booked</h1>
        <p className="text-slate-300 mt-2">{info.title}{info.hosts.length ? ` with ${info.hosts.join(' & ')}` : ''}</p>
        <p className="text-white text-lg font-medium mt-4">{fmtLong(booked)}</p>
        <p className="text-slate-500 text-sm mt-6">We&apos;ll reach out at the phone number you gave if anything changes.</p>
      </div>
    )
  }

  return shell(
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 md:p-8">
      {header}

      {slots.length === 0 ? (
        <p className="text-slate-400 bg-slate-800/60 rounded-lg p-4">No open times right now. Please check back soon.</p>
      ) : !chosen ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <p className="text-slate-200 text-sm font-medium">Pick a day</p>
            <div className="ml-auto flex gap-1">
              <button aria-label="Earlier days" onClick={() => setWeekStart(w => Math.max(0, w - 7))} disabled={weekStart === 0} className="p-1.5 rounded-md bg-slate-800 text-slate-300 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button aria-label="Later days" onClick={() => setWeekStart(w => w + 7)} disabled={weekStart + 7 >= days.length} className="p-1.5 rounded-md bg-slate-800 text-slate-300 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6">
            {visibleDays.map(k => {
              const d = new Date(`${k}T12:00:00`)
              return (
                <button
                  key={k}
                  onClick={() => setDay(k)}
                  className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${day === k ? 'border-cyan-400 bg-cyan-950/60 text-white' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500'}`}
                >
                  <p className="text-xs uppercase tracking-wide">{d.toLocaleDateString([], { weekday: 'short' })}</p>
                  <p className="text-lg font-semibold">{d.getDate()}</p>
                  <p className="text-[11px] text-slate-500">{d.toLocaleDateString([], { month: 'short' })}</p>
                </button>
              )
            })}
          </div>
          {day && (
            <>
              <p className="text-slate-200 text-sm font-medium mb-3">Pick a time</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {(byDay.get(day) ?? []).map(s => (
                  <button key={s} onClick={() => { setChosen(s); setError('') }} className="rounded-lg border border-slate-700 bg-slate-800/60 hover:border-cyan-400 hover:text-white text-slate-200 py-2.5 text-sm font-medium transition-colors">
                    {fmtTime(s)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3">
            <p className="text-white text-sm font-medium">{fmtLong(chosen)}</p>
            <button type="button" onClick={() => setChosen(null)} className="text-cyan-300 text-sm hover:underline">Change</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} autoComplete="name" required />
            <Field label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} autoComplete="email" required />
            <Field label="Phone" type="tel" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} autoComplete="tel" required />
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">Anything we should know? (optional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
          </div>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="hidden" aria-hidden="true" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Confirm booking
          </button>
        </form>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoComplete, required }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-slate-400 text-xs block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required={required} className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500" />
    </div>
  )
}
