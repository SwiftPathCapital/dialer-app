'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, PhoneIncoming, PhoneOutgoing, SkipForward, Phone } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import StatusSelector from '@/components/StatusSelector'
import VoicemailGreeting from '@/components/VoicemailGreeting'
import { Lead, Call } from '@/lib/types'

const DISPOSITIONS = [
  { label: 'Interested',     color: 'bg-green-700 hover:bg-green-600' },
  { label: 'Callback',       color: 'bg-blue-700 hover:bg-blue-600' },
  { label: 'Not Interested', color: 'bg-red-700 hover:bg-red-600' },
  { label: 'No Answer',      color: 'bg-gray-600 hover:bg-gray-500' },
  { label: 'Wrong Number',   color: 'bg-yellow-700 hover:bg-yellow-600' },
  { label: 'DNC',            color: 'bg-orange-700 hover:bg-orange-600' },
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
    if (!lead?.phone) { setCallHistory([]); return }
    const digits = lead.phone.replace(/\D/g, '')
    fetch(`/api/calls?to_number=${encodeURIComponent(digits)}&limit=10`)
      .then(r => r.json())
      .then(d => setCallHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [lead?.id])

  // Look up inbound caller in leads so we show their info instead of the queue lead
  useEffect(() => {
    if (!activeCall || activeCall.direction !== 'inbound') { setInboundLead(null); return }
    setInboundLead(null)  // clear immediately so stale name never shows
    const phone = activeCall.remoteNumber.replace(/\D/g, '')
    if (!phone) return
    fetch(`/api/leads?phone=${encodeURIComponent(phone)}&limit=1`)
      .then(r => r.json())
      .then(d => setInboundLead(Array.isArray(d) && d.length > 0 ? d[0] : null))
      .catch(() => {})
  }, [activeCall?.id, activeCall?.direction])

  // Detect when a call ends → trigger wrap-up
  useEffect(() => {
    const prev = prevCallRef.current
    prevCallRef.current = activeCall
    if (prev && !activeCall && lead) {
      setWrapup({ lead })
      setNotes('')
    }
  }, [activeCall])

  async function saveDisposition(disp: string) {
    if (!wrapup || !agent) return
    setSaving(true)
    const { lead: calledLead } = wrapup

    await Promise.all([
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
    ])

    setSaving(false)
    setWrapup(null)
    setNotes('')
    setIndex(i => Math.min(i + 1, leads.length - 1))
  }

  function dial() {
    if (!lead?.phone || wrapup) return
    const e164 = lead.phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
    makeCall(e164)
  }

  function skip() {
    setIndex(i => Math.min(i + 1, leads.length - 1))
  }

  if (!agent) return null

  const company = lead
    ? (lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown')
    : null
  const contact = lead?.company_name
    ? [lead.first_name, lead.last_name].filter(Boolean).join(' ')
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
          <ActiveCall lead={activeCall?.direction === 'inbound' ? inboundLead : lead} />
          <Dialpad />
          <VoicemailGreeting />
        </div>

        {/* Right: wrap-up OR preview dialer */}
        {lead && (
          <div className="flex-1 min-w-72 space-y-4">
            {wrapup ? (
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
                        onClick={() => saveDisposition(label)}
                        disabled={saving}
                        className={`${color} disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ── Lead preview card ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-widest">
                    Lead {index + 1} of {leads.length}
                  </p>
                  {lead.status && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{lead.status}</span>
                  )}
                </div>

                <p className="text-white font-semibold text-lg mt-2">{company}</p>
                {contact && <p className="text-gray-400 text-sm">{contact}</p>}
                <p className="text-gray-500 text-sm">{lead.phone}</p>

                <div className="border-t border-gray-700 mt-4 pt-4 space-y-2">
                  {lead.email && <Row label="Email" value={lead.email} />}
                  {(lead.city || lead.state) && <Row label="Location" value={[lead.city, lead.state].filter(Boolean).join(', ')} />}
                  {(lead.lead_type_label || lead.lead_type) && <Row label="Type" value={lead.lead_type_label || lead.lead_type!} />}
                  {lead.revenue && <Row label="Revenue" value={lead.revenue} />}
                  {lead.monthly_deposit && <Row label="Monthly Dep." value={lead.monthly_deposit} />}
                  {lead.requested_amount && <Row label="Requested" value={lead.requested_amount} />}
                  {lead.tib && <Row label="Time in Business" value={lead.tib} />}
                  {lead.fico && <Row label="FICO" value={lead.fico} />}
                  {lead.employee_size && <Row label="Employees" value={lead.employee_size} />}
                  {lead.why_funds && <Row label="Why Funds" value={lead.why_funds} />}
                </div>

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
                        {call.duration_seconds != null && (
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
