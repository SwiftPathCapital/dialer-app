'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Radar, PhoneOff, Mic, MicOff, Square, Play, Loader2 } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Session {
  id: string
  status: 'connecting' | 'ready' | 'on_call' | 'wrapup' | 'ended'
  current_attempt_id: string | null
}

interface ConnectedLead {
  id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  email: string | null
  city: string | null
  state: string | null
  lead_type_label: string | null
  lead_type: string | null
  revenue: string | number | null
  monthly_deposit: string | number | null
  requested_amount: string | number | null
  tib: string | null
  fico: string | null
  why_funds: string | null
}

const DISPOSITIONS = [
  'Interested', 'Callback', 'App Received', 'Docs Received', 'Pending App & Docs', 'Deal Funded',
  'Not Interested', 'No Answer', 'Left Voicemail', 'Wrong Number', 'DNC',
]

const POLL_MS = 2000

export default function PredictivePanel({ agentId, onActiveChange }: { agentId: string; onActiveChange: (active: boolean) => void }) {
  const { predictiveCall, armPredictive, disarmPredictive, predictiveMuted, togglePredictiveMute, activeCall } = useSoftphone()
  const [session, setSession] = useState<Session | null>(null)
  const [lead, setLead] = useState<ConnectedLead | null>(null)
  const [attempt, setAttempt] = useState<{ phone: string; connected_at: string | null } | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [stopAfter, setStopAfter] = useState(false)
  const [callbackAt, setCallbackAt] = useState('')
  const [pickingCallback, setPickingCallback] = useState(false)
  const [now, setNow] = useState(Date.now())
  // The lead for wrap-up — kept after the call ends even though the session moves on.
  const wrapLeadRef = useRef<{ lead: ConnectedLead | null; phone: string } | null>(null)

  const active = !!session && session.status !== 'ended'
  useEffect(() => { onActiveChange(active) }, [active, onActiveChange])

  const poll = useCallback(async () => {
    try {
      const d = await fetch(`/api/dialer/session?agent_id=${agentId}`).then(r => r.json())
      if (!d.session) {
        if (session) setError('Your predictive session ended (connection dropped or timed out).')
        setSession(null); setLead(null); setAttempt(null)
        disarmPredictive()
        return
      }
      setSession(d.session)
      if (d.lead || d.attempt) {
        setLead(d.lead)
        setAttempt(d.attempt)
        if (d.session.status === 'on_call') wrapLeadRef.current = { lead: d.lead, phone: d.attempt?.phone || '' }
      }
    } catch { /* transient — next poll retries */ }
  }, [agentId, session, disarmPredictive])

  // Pick up a session that's still open from before a page reload.
  useEffect(() => {
    fetch(`/api/dialer/session?agent_id=${agentId}`).then(r => r.json()).then(d => {
      if (d.session) { setSession(d.session); armPredictive(null) }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  useEffect(() => {
    if (!active) return
    const t = setInterval(poll, POLL_MS)
    return () => clearInterval(t)
  }, [active, poll])

  useEffect(() => {
    if (session?.status !== 'on_call') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [session?.status])

  async function start() {
    setError('')
    setStarting(true)
    const res = await fetch('/api/dialer/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, action: 'start' }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setStarting(false)
    if (!res?.ok || !d?.session) { setError(d?.error || 'Could not start predictive dialing'); return }
    armPredictive(d.expectFrom ?? null)
    setSession(d.session)
    setStopAfter(false)
  }

  async function post(action: 'ready' | 'stop' | 'hangup_lead') {
    await fetch('/api/dialer/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, action }),
    }).catch(() => {})
  }

  async function stop() {
    await post('stop')
    disarmPredictive()
    setSession(null); setLead(null); setAttempt(null)
    wrapLeadRef.current = null
  }

  async function saveDisposition(disp: string) {
    const wrap = wrapLeadRef.current
    if (!wrap) { await finishWrap(); return }
    if (disp === 'Callback' && !callbackAt) { setPickingCallback(true); return }
    setSaving(true)
    const callbackIso = disp === 'Callback' && callbackAt ? new Date(callbackAt).toISOString() : null
    const requests: Promise<unknown>[] = [
      fetch('/api/calls/disposition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_phone: wrap.lead?.phone || wrap.phone, lead_id: wrap.lead?.id || null, agent_id: agentId, disposition: disp, notes: notes.trim() || null, callback_at: callbackIso }),
      }),
    ]
    if (wrap.lead) {
      requests.push(fetch('/api/leads', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wrap.lead.id, status: disp }),
      }))
      if (callbackIso) {
        requests.push(fetch('/api/callbacks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: wrap.lead.id, lead_phone: wrap.lead.phone, agent_id: agentId, scheduled_at: callbackIso, notes: notes.trim() || null,
            lead_name: wrap.lead.company_name || [wrap.lead.first_name, wrap.lead.last_name].filter(Boolean).join(' ') || wrap.lead.name,
          }),
        }))
      }
    }
    await Promise.all(requests.map(r => r.catch(() => null)))
    setSaving(false)
    await finishWrap()
  }

  async function finishWrap() {
    setNotes(''); setCallbackAt(''); setPickingCallback(false)
    wrapLeadRef.current = null
    setLead(null); setAttempt(null)
    if (stopAfter) { await stop(); return }
    await post('ready')
    poll()
  }

  const wrap = wrapLeadRef.current
  const shownLead = session?.status === 'wrapup' ? wrap?.lead ?? null : lead
  const company = shownLead ? (shownLead.company_name || [shownLead.first_name, shownLead.last_name].filter(Boolean).join(' ') || shownLead.name || 'Unknown') : null
  const talkSeconds = attempt?.connected_at ? Math.max(0, Math.round((now - new Date(attempt.connected_at).getTime()) / 1000)) : 0

  if (!active) {
    return (
      <div className="bg-gray-800 rounded-xl border border-cyan-800/60 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Radar className="w-4 h-4 text-cyan-400" />
          <p className="text-white font-semibold">Predictive dialer</p>
        </div>
        <p className="text-gray-400 text-sm mb-4">The dialer calls leads for you and connects you the moment someone answers. Keep this tab open while you&apos;re dialing.</p>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          onClick={start}
          disabled={starting || !!activeCall}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors"
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {starting ? 'Connecting…' : 'Start predictive dialing'}
        </button>
        {activeCall && <p className="text-gray-500 text-xs mt-2">Finish your current call first.</p>}
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-cyan-700 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Radar className={`w-4 h-4 ${session.status === 'ready' ? 'text-cyan-300 animate-pulse' : 'text-cyan-400'}`} />
        <p className="text-white font-semibold">Predictive dialer</p>
        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/60 text-cyan-200">
          {session.status === 'connecting' ? 'Connecting your line' : session.status === 'ready' ? 'Waiting for a live answer' : session.status === 'on_call' ? 'On call' : 'Wrap-up'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {predictiveCall && (
            <button onClick={togglePredictiveMute} title={predictiveMuted ? 'Unmute' : 'Mute'} className="p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200">
              {predictiveMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button onClick={stop} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-700 hover:bg-red-700 text-gray-200 text-xs">
            <Square className="w-3 h-3" /> Stop
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {session.status === 'connecting' && !predictiveCall && (
        <p className="text-gray-400 text-sm">Setting up your line — this answers automatically.</p>
      )}
      {session.status === 'ready' && (
        <p className="text-gray-400 text-sm">You&apos;re on the line. Leads are being dialed; you&apos;ll hear the next person who answers.</p>
      )}

      {(session.status === 'on_call' || session.status === 'wrapup') && (
        <div className="bg-gray-900/60 rounded-lg border border-gray-700 p-4">
          <p className="text-white font-semibold text-lg">{company ?? (wrap?.phone || attempt?.phone)}</p>
          <p className="text-gray-400 text-sm">{shownLead?.phone || wrap?.phone || attempt?.phone}{shownLead?.state ? ` · ${[shownLead.city, shownLead.state].filter(Boolean).join(', ')}` : ''}</p>
          {session.status === 'on_call' && (
            <p className="text-cyan-300 text-sm tabular-nums mt-1">{Math.floor(talkSeconds / 60)}:{String(talkSeconds % 60).padStart(2, '0')}</p>
          )}
          {shownLead && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
              {shownLead.lead_type_label || shownLead.lead_type ? <Row label="Type" value={String(shownLead.lead_type_label || shownLead.lead_type)} /> : null}
              {shownLead.revenue ? <Row label="Revenue" value={String(shownLead.revenue)} /> : null}
              {shownLead.monthly_deposit ? <Row label="Monthly dep." value={String(shownLead.monthly_deposit)} /> : null}
              {shownLead.requested_amount ? <Row label="Requested" value={String(shownLead.requested_amount)} /> : null}
              {shownLead.tib ? <Row label="Time in business" value={shownLead.tib} /> : null}
              {shownLead.fico ? <Row label="FICO" value={shownLead.fico} /> : null}
              {shownLead.why_funds ? <Row label="Why funds" value={shownLead.why_funds} /> : null}
            </div>
          )}
          {session.status === 'on_call' && (
            <button onClick={() => post('hangup_lead')} className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors">
              <PhoneOff className="w-4 h-4" /> Hang up
            </button>
          )}
        </div>
      )}

      {session.status === 'wrapup' && (
        <div className="space-y-3">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Call notes (saved to the lead)"
            rows={3}
            autoFocus
            className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600 resize-none"
          />
          {pickingCallback && (
            <div className="flex items-center gap-2">
              <input type="datetime-local" value={callbackAt} onChange={e => setCallbackAt(e.target.value)} className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2" />
              <button onClick={() => saveDisposition('Callback')} disabled={!callbackAt || saving} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg">Schedule</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {DISPOSITIONS.map(d => (
              <button key={d} onClick={() => saveDisposition(d)} disabled={saving} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                {saving ? '…' : d}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={stopAfter} onChange={e => setStopAfter(e.target.checked)} />
            Stop dialing after this disposition
          </label>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-200 truncate">{value}</span>
    </div>
  )
}
