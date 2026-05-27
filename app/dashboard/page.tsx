'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, PhoneIncoming, PhoneOutgoing, SkipForward, Phone } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import StatusSelector from '@/components/StatusSelector'
import VoicemailGreeting from '@/components/VoicemailGreeting'
import NewLeadForm from '@/components/NewLeadForm'
import { Lead, Call } from '@/lib/types'

const DISPOSITIONS = [
  { label: 'Interested',          color: 'bg-green-700 hover:bg-green-600' },
  { label: 'Callback',            color: 'bg-blue-700 hover:bg-blue-600' },
  { label: 'App Received',        color: 'bg-teal-700 hover:bg-teal-600' },
  { label: 'Docs Received',       color: 'bg-indigo-700 hover:bg-indigo-600' },
  { label: 'Pending App & Docs',  color: 'bg-amber-700 hover:bg-amber-600' },
  { label: 'Deal Funded',         color: 'bg-emerald-600 hover:bg-emerald-500' },
  { label: 'Not Interested',      color: 'bg-red-700 hover:bg-red-600' },
  { label: 'No Answer',           color: 'bg-gray-600 hover:bg-gray-500' },
  { label: 'Left Voicemail',      color: 'bg-purple-700 hover:bg-purple-600' },
  { label: 'Wrong Number',        color: 'bg-yellow-700 hover:bg-yellow-600' },
  { label: 'DNC',                 color: 'bg-orange-700 hover:bg-orange-600' },
]

export default function DashboardPage() {
  const { agent, agentLoading, activeCall, makeCall } = useSoftphone()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [index, setIndex] = useState(0)
  const [callHistory, setCallHistory] = useState<Call[]>([])
  const [wrapup, setWrapup] = useState<{ lead: Lead } | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [inboundLead, setInboundLead] = useState<Lead | null>(null)
  const [dialedLead, setDialedLead] = useState<Lead | null>(null)
  const [callLeadLoading, setCallLeadLoading] = useState(false)
  const [callbackPicker, setCallbackPicker] = useState<{ lead: Lead } | null>(null)
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackTime, setCallbackTime] = useState('')
  const [callbackNotes, setCallbackNotes] = useState('')
  const prevCallRef = useRef(activeCall)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    fetch(`/api/leads?agent_id=${agent.id}&limit=200`)
      .then(r => r.json())
      .then(d => setLeads(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [agent, agentLoading, router])

  const lead = leads[index] ?? null

  useEffect(() => {
    // Show call history for whoever is on the line; fall back to queue lead
    const historyLead = activeCall
      ? (activeCall.direction === 'inbound' ? inboundLead : dialedLead)
      : lead
    if (!historyLead?.phone) { setCallHistory([]); return }
    const digits = historyLead.phone.replace(/\D/g, '')
    fetch(`/api/calls?to_number=${encodeURIComponent(digits)}&limit=10`)
      .then(r => r.json())
      .then(d => setCallHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [lead?.id, activeCall?.id, inboundLead?.id, dialedLead?.id])

  // Look up inbound caller in leads so we show their info instead of the queue lead
  useEffect(() => {
    if (!activeCall || activeCall.direction !== 'inbound') { setInboundLead(null); setCallLeadLoading(false); return }
    setInboundLead(null)
    setCallLeadLoading(true)
    const phone = activeCall.remoteNumber.replace(/\D/g, '')
    if (!phone) { setCallLeadLoading(false); return }
    fetch(`/api/leads?phone=${encodeURIComponent(phone)}&limit=1`)
      .then(r => r.json())
      .then(d => setInboundLead(Array.isArray(d) && d.length > 0 ? d[0] : null))
      .catch(() => {})
      .finally(() => setCallLeadLoading(false))
  }, [activeCall?.id, activeCall?.direction])

  // For manual outbound dials (Dialpad), dialedLead isn't set by dial() — fetch it by number
  useEffect(() => {
    if (!activeCall || activeCall.direction !== 'outbound') return
    if (dialedLead) { setCallLeadLoading(false); return }
    setCallLeadLoading(true)
    const phone = activeCall.remoteNumber.replace(/\D/g, '')
    if (!phone) { setCallLeadLoading(false); return }
    fetch(`/api/leads?phone=${encodeURIComponent(phone)}&limit=1`)
      .then(r => r.json())
      .then(d => setDialedLead(Array.isArray(d) && d.length > 0 ? d[0] : null))
      .catch(() => {})
      .finally(() => setCallLeadLoading(false))
  }, [activeCall?.id, activeCall?.direction])

  // Detect when a call ends → trigger wrap-up
  useEffect(() => {
    const prev = prevCallRef.current
    prevCallRef.current = activeCall
    if (prev && !activeCall) {
      // Inbound calls that ended while still ringing mean another agent answered — skip dispo
      if (prev.direction === 'inbound' && prev.state === 'ringing') { setDialedLead(null); return }
      const wrapLead = prev.direction === 'outbound' ? (dialedLead || lead) : (inboundLead || lead)
      setDialedLead(null)
      if (wrapLead) { setWrapup({ lead: wrapLead }); setNotes('') }
    }
  }, [activeCall])

  function selectDisposition(disp: string) {
    if (!wrapup || !agent) return
    if (disp === 'Callback') {
      // Pre-fill date to tomorrow at 10am
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setCallbackDate(tomorrow.toISOString().slice(0, 10))
      setCallbackTime('10:00')
      setCallbackNotes(notes.trim())
      setCallbackPicker({ lead: wrapup.lead })
      return
    }
    saveDisposition(disp, null)
  }

  async function saveDisposition(disp: string, callbackAt: string | null) {
    if (!wrapup || !agent) return
    setSaving(true)
    const { lead: calledLead } = wrapup

    const requests: Promise<unknown>[] = [
      fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: calledLead.id, status: disp }),
      }),
      fetch('/api/calls/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_phone: calledLead.phone,
          lead_id: calledLead.id,
          agent_id: agent.id,
          disposition: disp,
          notes: notes.trim() || null,
        }),
      }),
    ]

    if (disp === 'Callback' && callbackAt) {
      requests.push(
        fetch('/api/callbacks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: calledLead.id,
            lead_phone: calledLead.phone,
            lead_name: calledLead.company_name || [calledLead.first_name, calledLead.last_name].filter(Boolean).join(' ') || calledLead.name,
            agent_id: agent.id,
            scheduled_at: callbackAt,
            notes: callbackNotes.trim() || notes.trim() || null,
          }),
        })
      )
    }

    await Promise.all(requests)

    setSaving(false)
    setWrapup(null)
    setNotes('')
    setCallbackPicker(null)
    setCallbackDate('')
    setCallbackTime('')
    setCallbackNotes('')
    setIndex(i => Math.min(i + 1, leads.length - 1))
  }

  function dial() {
    if (!lead?.phone || wrapup) return
    const e164 = lead.phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
    setDialedLead(lead)
    makeCall(e164)
  }

  function skip() {
    setIndex(i => Math.min(i + 1, leads.length - 1))
  }

  if (!agent) return null

  // During a call, show that caller's lead; otherwise show queue lead
  const activeLead = activeCall
    ? (activeCall.direction === 'inbound' ? inboundLead : dialedLead)
    : null
  const displayedLead = activeLead ?? lead

  const company = displayedLead
    ? (displayedLead.company_name || [displayedLead.first_name, displayedLead.last_name].filter(Boolean).join(' ') || displayedLead.name || 'Unknown')
    : null
  const contact = displayedLead?.company_name
    ? [displayedLead.first_name, displayedLead.last_name].filter(Boolean).join(' ')
    : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Softphone</h1>
          <p className="text-gray-400 text-sm mt-0.5">{agent.name} · ext. {agent.extension || agent.sip_username}</p>
        </div>
        <StatusSelector />
      </div>

      <div className="flex flex-wrap gap-6">
        {/* Left: softphone */}
        <div className="space-y-4">
          <ActiveCall lead={activeCall?.direction === 'inbound' ? inboundLead : dialedLead} />
          <Dialpad />
          <VoicemailGreeting />
        </div>

        {/* Right: wrap-up OR new-lead form OR preview dialer */}
        {(wrapup || lead || activeLead || (activeCall && !callLeadLoading)) && (
          <div className="flex-1 min-w-72 space-y-4">
            {wrapup && callbackPicker ? (
              /* ── Callback scheduler ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
                <div>
                  <p className="text-white font-semibold text-base">Schedule Callback</p>
                  <p className="text-gray-500 text-sm">{callbackPicker.lead.company_name || [callbackPicker.lead.first_name, callbackPicker.lead.last_name].filter(Boolean).join(' ') || callbackPicker.lead.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs uppercase tracking-widest mb-1.5 block">Date</label>
                    <input
                      type="date"
                      value={callbackDate}
                      onChange={e => setCallbackDate(e.target.value)}
                      className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs uppercase tracking-widest mb-1.5 block">Time</label>
                    <input
                      type="time"
                      value={callbackTime}
                      onChange={e => setCallbackTime(e.target.value)}
                      className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-widest mb-1.5 block">Notes</label>
                  <textarea
                    value={callbackNotes}
                    onChange={e => setCallbackNotes(e.target.value)}
                    placeholder="What to discuss on callback…"
                    rows={3}
                    className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (!callbackDate || !callbackTime) return
                      const iso = new Date(`${callbackDate}T${callbackTime}`).toISOString()
                      setWrapup(prev => prev ? { ...prev } : null)
                      saveDisposition('Callback', iso)
                    }}
                    disabled={saving || !callbackDate || !callbackTime}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
                  >
                    {saving ? 'Saving…' : 'Schedule Callback'}
                  </button>
                  <button
                    onClick={() => setCallbackPicker(null)}
                    className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : wrapup ? (
              /* ── Wrap-up: notes + disposition ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
                <div>
                  <p className="text-white font-semibold text-base">
                    {wrapup.lead.company_name || [wrapup.lead.first_name, wrapup.lead.last_name].filter(Boolean).join(' ') || wrapup.lead.name}
                  </p>
                  <p className="text-gray-500 text-sm">Call ended · add notes then select a disposition</p>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-widest mb-1.5 block">Call Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="What happened on this call? (saved to CRM)"
                    rows={4}
                    className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 resize-none"
                  />
                </div>

                {/* Dispositions */}
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-widest mb-1.5 block">Disposition</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DISPOSITIONS.map(({ label, color }) => (
                      <button
                        key={label}
                        onClick={() => selectDisposition(label)}
                        disabled={saving}
                        className={`${color} disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : activeCall && !callLeadLoading && !activeLead ? (
              /* ── Unknown caller: quick lead creation form ── */
              <NewLeadForm
                phone={activeCall.remoteNumber}
                direction={activeCall.direction}
                agentId={agent.id}
                onCreated={newLead => {
                  if (activeCall.direction === 'inbound') setInboundLead(newLead)
                  else setDialedLead(newLead)
                }}
              />
            ) : (
              /* ── Lead preview card ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-widest">
                    {activeLead ? 'On Call' : `Lead ${index + 1} of ${leads.length}`}
                  </p>
                  {displayedLead?.status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{displayedLead.status}</span>
                  )}
                </div>

                <p className="text-white font-semibold text-lg mt-2">{company}</p>
                {contact && <p className="text-gray-400 text-sm">{contact}</p>}
                <p className="text-gray-500 text-sm">{displayedLead?.phone}</p>

                <div className="border-t border-gray-700 mt-4 pt-4 space-y-2">
                  {displayedLead?.email && <Row label="Email" value={displayedLead.email} />}
                  {(displayedLead?.city || displayedLead?.state) && <Row label="Location" value={[displayedLead.city, displayedLead.state].filter(Boolean).join(', ')} />}
                  {(displayedLead?.lead_type_label || displayedLead?.lead_type) && <Row label="Type" value={displayedLead.lead_type_label || displayedLead.lead_type!} />}
                  {displayedLead?.revenue && <Row label="Revenue" value={displayedLead.revenue} />}
                  {displayedLead?.monthly_deposit && <Row label="Monthly Dep." value={displayedLead.monthly_deposit} />}
                  {displayedLead?.requested_amount && <Row label="Requested" value={displayedLead.requested_amount} />}
                  {displayedLead?.tib && <Row label="Time in Business" value={displayedLead.tib} />}
                  {displayedLead?.fico && <Row label="FICO" value={displayedLead.fico} />}
                  {displayedLead?.employee_size && <Row label="Employees" value={displayedLead.employee_size} />}
                  {displayedLead?.why_funds && <Row label="Why Funds" value={displayedLead.why_funds} />}
                </div>

                {!activeLead && lead && (
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={dial}
                      disabled={!!activeCall}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors"
                    >
                      <Phone className="w-4 h-4" /> Call
                    </button>
                    <button
                      onClick={skip}
                      disabled={index >= leads.length - 1 || !!activeCall}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg transition-colors text-sm"
                    >
                      <SkipForward className="w-4 h-4" /> Skip
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Previous dials */}
            {callHistory.length > 0 && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Previous Dials</p>
                <div className="space-y-2">
                  {callHistory.map(call => (
                    <div key={call.id} className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                      <div className="flex items-center gap-3">
                        <span className={`p-2 rounded-full ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                          {call.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-sm">{new Date(call.started_at).toLocaleString()}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-gray-500 text-xs">{call.status}</p>
                            {(call as any).disposition && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-300">{(call as any).disposition}</span>
                            )}
                          </div>
                        </div>
                        {call.duration_seconds != null && call.duration_seconds > 0 && (
                          <div className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                            <Clock className="w-3 h-3" />
                            {Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, '0')}
                          </div>
                        )}
                      </div>
                      {(call as any).notes && (
                        <p className="text-gray-500 text-xs mt-2 pl-11 italic">"{(call as any).notes}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  )
}
