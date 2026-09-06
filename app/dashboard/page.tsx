'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, PhoneIncoming, PhoneOutgoing, SkipForward, Phone, Mail, RotateCcw, Plus, X } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import StatusSelector from '@/components/StatusSelector'
import VoicemailGreeting from '@/components/VoicemailGreeting'
import NewLeadForm from '@/components/NewLeadForm'
import { Lead, Call, Tag } from '@/lib/types'

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
  const [wrapup, setWrapup] = useState<{ lead: Lead | null; phone: string } | null>(null)
  const [wrapupStep, setWrapupStep] = useState<'notes' | 'dispo'>('notes')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [inboundLead, setInboundLead] = useState<Lead | null>(null)
  const [dialedLead, setDialedLead] = useState<Lead | null>(null)
  const [callLeadLoading, setCallLeadLoading] = useState(false)
  const [callbackPicker, setCallbackPicker] = useState<{ lead: Lead | null } | null>(null)
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackTime, setCallbackTime] = useState('')
  const [callbackNotes, setCallbackNotes] = useState('')
  // New-lead modal — persists independently of activeCall so it survives disconnect
  const [newLeadModal, setNewLeadModal] = useState<{ phone: string; direction: 'inbound' | 'outbound' } | null>(null)
  const newLeadShownForRef = useRef<string | null>(null) // tracks which call.id triggered the modal
  const prevCallRef = useRef(activeCall)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    fetch(`/api/leads?agent_id=${agent.id}&limit=200`)
      .then(r => r.json())
      .then(d => setLeads(Array.isArray(d) ? d : []))
      .catch(() => {})
    fetch('/api/admin/tags').then(r => r.json()).then(d => setAllTags(Array.isArray(d) ? d : [])).catch(() => {})
  }, [agent, agentLoading, router])

  // Apply a tag-list update to whichever state currently holds this lead
  function applyTagsUpdate(leadId: string, tags: Tag[]) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, tags } : l))
    setInboundLead(prev => prev && prev.id === leadId ? { ...prev, tags } : prev)
    setDialedLead(prev => prev && prev.id === leadId ? { ...prev, tags } : prev)
  }

  async function toggleTag(leadId: string, currentTags: Tag[], tag: Tag) {
    const has = currentTags.some(t => t.id === tag.id)
    applyTagsUpdate(leadId, has ? currentTags.filter(t => t.id !== tag.id) : [...currentTags, tag])
    if (has) {
      await fetch(`/api/leads/tags?lead_id=${leadId}&tag_id=${tag.id}`, { method: 'DELETE' }).catch(() => {})
    } else {
      await fetch('/api/leads/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, tag_id: tag.id }),
      }).catch(() => {})
    }
  }

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

  // Show new-lead modal when an active call has no matching lead record.
  // Fires once per call (guarded by newLeadShownForRef) and stays open even
  // after the call disconnects — only Save or Cancel closes it.
  // Uses raw state (inboundLead/dialedLead) because activeLead is derived below.
  useEffect(() => {
    const resolvedLead = activeCall
      ? (activeCall.direction === 'inbound' ? inboundLead : dialedLead)
      : null
    if (
      activeCall &&
      !activeCall.groupName &&          // skip group ring-all calls
      !callLeadLoading &&
      !resolvedLead &&
      newLeadShownForRef.current !== activeCall.id
    ) {
      newLeadShownForRef.current = activeCall.id
      setNewLeadModal({ phone: activeCall.remoteNumber, direction: activeCall.direction })
    }
  }, [activeCall?.id, callLeadLoading, inboundLead, dialedLead])

  // If a lead gets matched later (agent created one, or lookup finished), close the modal
  useEffect(() => {
    if (inboundLead || dialedLead) {
      setNewLeadModal(null)
      newLeadShownForRef.current = null
    }
  }, [inboundLead?.id, dialedLead?.id])

  // Detect when a call ends → trigger wrap-up
  useEffect(() => {
    const prev = prevCallRef.current
    prevCallRef.current = activeCall
    if (prev && !activeCall) {
      // Inbound calls that ended while still ringing mean another agent answered — skip dispo
      if (prev.direction === 'inbound' && prev.state === 'ringing') { setDialedLead(null); return }
      const wrapLead = prev.direction === 'outbound' ? dialedLead : inboundLead
      const phone = prev.remoteNumber || ''
      setDialedLead(null)
      // Always show wrap-up — even if no lead matched, use phone number as identifier
      setWrapup({ lead: wrapLead ?? null, phone })
      setWrapupStep('notes')
      setNotes('')
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
    const { lead: calledLead, phone: calledPhone } = wrapup

    const requests: Promise<unknown>[] = []

    // Only update lead status / disposition if we have an actual lead record
    if (calledLead) {
      requests.push(
        fetch('/api/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: calledLead.id, status: disp }),
        })
      )
    }

    requests.push(
      fetch('/api/calls/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_phone: calledLead?.phone || calledPhone,
          lead_id: calledLead?.id || null,
          agent_id: agent.id,
          disposition: disp,
          notes: notes.trim() || null,
        }),
      })
    )

    if (disp === 'Callback' && callbackAt && calledLead) {
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
    setWrapupStep('notes')
    setNotes('')
    setCallbackPicker(null)
    setCallbackDate('')
    setCallbackTime('')
    setCallbackNotes('')
    setIndex(i => Math.min(i + 1, leads.length - 1))
  }

  function redial() {
    if (!wrapup) return
    const raw = wrapup.phone.replace(/\D/g, '')
    const e164 = raw.replace(/^1?(\d{10})$/, '+1$1')
    if (!e164.startsWith('+')) return
    if (wrapup.lead) setDialedLead(wrapup.lead)
    setWrapup(null)
    setWrapupStep('notes')
    setNotes('')
    makeCall(e164, { bypassCooldown: true })
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

        {/* Right: new-lead form (inline) + wrap-up / preview dialer */}
        {(wrapup || lead || activeLead || newLeadModal || (activeCall && !callLeadLoading)) && (
          <div className="flex-1 min-w-72 space-y-4">

            {/* Inline new-contact form — shown when caller has no lead record yet */}
            {newLeadModal && !inboundLead && !dialedLead && (
              <NewLeadForm
                phone={newLeadModal.phone}
                direction={newLeadModal.direction}
                agentId={agent.id}
                inline
                onCreated={newLead => {
                  if (newLeadModal.direction === 'inbound') setInboundLead(newLead)
                  else setDialedLead(newLead)
                  setWrapup(prev => prev ? { ...prev, lead: newLead } : prev)
                  setNewLeadModal(null)
                  newLeadShownForRef.current = null
                }}
                onCancel={() => {
                  setNewLeadModal(null)
                  newLeadShownForRef.current = null
                }}
              />
            )}
            {wrapup && callbackPicker ? (
              /* ── Callback scheduler ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
                <div>
                  <p className="text-white font-semibold text-base">Schedule Callback</p>
                  <p className="text-gray-500 text-sm">
                    {callbackPicker.lead
                      ? (callbackPicker.lead.company_name || [callbackPicker.lead.first_name, callbackPicker.lead.last_name].filter(Boolean).join(' ') || callbackPicker.lead.name)
                      : wrapup.phone}
                  </p>
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

            ) : wrapup && wrapupStep === 'notes' ? (
              /* ── Step 1: Notes ── */
              <div className="bg-gray-800 rounded-xl border border-yellow-700/60 p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest">Step 1 of 2</span>
                    <span className="text-gray-600 text-xs">— Call Notes</span>
                  </div>
                  <p className="text-white font-semibold text-base">
                    {wrapup.lead
                      ? (wrapup.lead.company_name || [wrapup.lead.first_name, wrapup.lead.last_name].filter(Boolean).join(' ') || wrapup.lead.name || wrapup.phone)
                      : wrapup.phone}
                  </p>
                  <p className="text-gray-500 text-sm mt-0.5">Add your call notes, then continue to set a disposition.</p>
                </div>

                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-widest mb-1.5 block">Call Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="What happened on this call? (saved to CRM)"
                    rows={5}
                    autoFocus
                    className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-yellow-500 placeholder-gray-600 resize-none"
                  />
                </div>

                <button
                  onClick={() => setWrapupStep('dispo')}
                  className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  Save Notes &amp; Continue →
                </button>
              </div>

            ) : wrapup && wrapupStep === 'dispo' ? (
              /* ── Step 2: Disposition ── */
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-green-400 text-xs font-bold uppercase tracking-widest">Step 2 of 2</span>
                      <span className="text-gray-600 text-xs">— Disposition</span>
                    </div>
                    <p className="text-white font-semibold text-base">
                      {wrapup.lead
                        ? (wrapup.lead.company_name || [wrapup.lead.first_name, wrapup.lead.last_name].filter(Boolean).join(' ') || wrapup.lead.name || wrapup.phone)
                        : wrapup.phone}
                    </p>
                  </div>
                  <button
                    onClick={() => setWrapupStep('notes')}
                    className="text-xs text-gray-500 hover:text-gray-300 shrink-0 mt-1 transition-colors"
                  >
                    ← Edit Notes
                  </button>
                </div>

                {/* Notes preview */}
                {notes.trim() && (
                  <div className="bg-gray-900/60 rounded-lg px-3 py-2.5 border border-gray-700">
                    <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Notes</p>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{notes.trim()}</p>
                  </div>
                )}

                {/* Send Email shortcut */}
                <button
                  onClick={() => {
                    const to = wrapup?.lead?.email ? encodeURIComponent(wrapup.lead.email) : ''
                    const subject = wrapup?.lead?.company_name
                      ? encodeURIComponent(`Follow Up – ${wrapup.lead.company_name}`)
                      : ''
                    const url = `https://mail.zoho.com/zm/#compose${to || subject ? `?to=${to}&subject=${subject}` : ''}`
                    window.open(url, '_blank', 'noopener')
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors border border-gray-600"
                >
                  <Mail className="w-4 h-4" />
                  Send Email
                  {wrapup?.lead?.email && (
                    <span className="text-gray-400 text-xs truncate max-w-[140px]">{wrapup.lead.email}</span>
                  )}
                </button>

                {/* Redial */}
                <button
                  onClick={redial}
                  disabled={saving || !!activeCall}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Redial {wrapup?.phone}
                </button>

                {/* Dispositions */}
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-widest mb-2 block">Select Disposition</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DISPOSITIONS.map(({ label, color }) => (
                      <button
                        key={label}
                        onClick={() => selectDisposition(label)}
                        disabled={saving}
                        className={`${color} disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors`}
                      >
                        {saving ? '…' : label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            ) : !newLeadModal ? (
              /* ── Lead preview card — hidden while unknown-caller form is open ── */
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

                {displayedLead && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 relative">
                    {(displayedLead.tags ?? []).map(tag => (
                      <span
                        key={tag.id}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                        <button onClick={() => toggleTag(displayedLead.id, displayedLead.tags ?? [], tag)} className="hover:opacity-70">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => setTagMenuOpen(p => !p)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-gray-400 border border-dashed border-gray-600 hover:text-white hover:border-gray-400 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Tag
                    </button>
                    {tagMenuOpen && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 py-1 max-h-56 overflow-y-auto">
                        {allTags.length === 0 ? (
                          <p className="text-gray-500 text-xs px-3 py-2">No tags yet — create one in Admin → Tags.</p>
                        ) : allTags.map(tag => {
                          const applied = (displayedLead.tags ?? []).some(t => t.id === tag.id)
                          return (
                            <button
                              key={tag.id}
                              onClick={() => toggleTag(displayedLead.id, displayedLead.tags ?? [], tag)}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-gray-800 transition-colors"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                              <span className={applied ? 'text-white' : 'text-gray-400'}>{tag.name}</span>
                              {applied && <span className="ml-auto text-blue-400">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

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
            ) : null}

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
