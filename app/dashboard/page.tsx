'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Building2, ChevronRight, Phone, ArrowLeft, Clock, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import LeadPanel from '@/components/LeadPanel'
import StatusSelector from '@/components/StatusSelector'
import VoicemailGreeting from '@/components/VoicemailGreeting'
import { Lead, Call } from '@/lib/types'

export default function DashboardPage() {
  const { agent, agentLoading, makeCall } = useSoftphone()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [callHistory, setCallHistory] = useState<Call[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    loadLeads('')
  }, [agent, agentLoading, router])

  useEffect(() => {
    if (!selectedLead?.phone) { setCallHistory([]); return }
    const digits = selectedLead.phone.replace(/\D/g, '')
    fetch(`/api/calls?to_number=${encodeURIComponent(digits)}&limit=20`)
      .then(r => r.json())
      .then(d => setCallHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [selectedLead?.id])

  async function loadLeads(q: string) {
    setLeadsLoading(true)
    const params = new URLSearchParams({ agent_id: agent!.id, limit: '200' })
    if (q) params.set('search', q)
    const res = await fetch(`/api/leads?${params}`)
    const data = await res.json()
    setLeads(Array.isArray(data) ? data : [])
    setLeadsLoading(false)
  }

  function handleSearch(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadLeads(value), 300)
  }

  function dial(lead: Lead) {
    if (!lead.phone) return
    const e164 = lead.phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
    setSelectedLead(lead)
    makeCall(e164)
  }

  if (!agent) return null

  const company = selectedLead
    ? (selectedLead.company_name || [selectedLead.first_name, selectedLead.last_name].filter(Boolean).join(' ') || selectedLead.name || 'Unknown')
    : null
  const contact = selectedLead?.company_name
    ? [selectedLead.first_name, selectedLead.last_name].filter(Boolean).join(' ')
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
        {/* Left: softphone controls */}
        <div className="space-y-4">
          <ActiveCall lead={selectedLead} />
          <Dialpad />
          <VoicemailGreeting />
        </div>

        {/* Right: lead list OR selected lead focus */}
        <div className="flex-1 min-w-72">
          {selectedLead ? (
            /* ── Focus view ── */
            <div className="space-y-4">
              {/* Back to list */}
              <button
                onClick={() => setSelectedLead(null)}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to leads
              </button>

              {/* Lead info card */}
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
                <div>
                  <p className="text-white font-semibold text-base">{company}</p>
                  {contact && <p className="text-gray-400 text-sm">{contact}</p>}
                  <p className="text-gray-500 text-sm">{selectedLead.phone}</p>
                </div>

                <div className="border-t border-gray-700 pt-3 space-y-2">
                  {selectedLead.email && <Row label="Email" value={selectedLead.email} />}
                  {(selectedLead.city || selectedLead.state) && (
                    <Row label="Location" value={[selectedLead.city, selectedLead.state].filter(Boolean).join(', ')} />
                  )}
                  {selectedLead.status && <Row label="Status" value={selectedLead.status} />}
                  {(selectedLead.lead_type_label || selectedLead.lead_type) && (
                    <Row label="Type" value={selectedLead.lead_type_label || selectedLead.lead_type!} />
                  )}
                  {selectedLead.revenue && <Row label="Revenue" value={selectedLead.revenue} />}
                  {selectedLead.monthly_deposit && <Row label="Monthly Dep." value={selectedLead.monthly_deposit} />}
                  {selectedLead.requested_amount && <Row label="Requested" value={selectedLead.requested_amount} />}
                  {selectedLead.tib && <Row label="Time in Business" value={selectedLead.tib} />}
                  {selectedLead.fico && <Row label="FICO" value={selectedLead.fico} />}
                  {selectedLead.employee_size && <Row label="Employees" value={selectedLead.employee_size} />}
                  {selectedLead.why_funds && <Row label="Why Funds" value={selectedLead.why_funds} />}
                </div>
              </div>

              {/* Call history */}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Previous Dials</p>
                {callHistory.length === 0 ? (
                  <p className="text-gray-600 text-sm">No previous calls</p>
                ) : (
                  <div className="space-y-2">
                    {callHistory.map(call => (
                      <div key={call.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                        <span className={`p-2 rounded-full ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                          {call.direction === 'inbound'
                            ? <PhoneIncoming className="w-4 h-4" />
                            : <PhoneOutgoing className="w-4 h-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-300 text-sm">{new Date(call.started_at).toLocaleString()}</p>
                          <p className="text-gray-500 text-xs">{call.status}</p>
                        </div>
                        {call.duration_seconds != null && (
                          <div className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                            <Clock className="w-3 h-3" />
                            {Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, '0')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Lead list ── */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-xs uppercase tracking-widest">Preview Dialer</p>
                <span className="text-gray-600 text-xs">{leads.length} leads</span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search leads…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {leadsLoading ? (
                <p className="text-gray-600 text-sm">Loading…</p>
              ) : leads.length === 0 ? (
                <p className="text-gray-600 text-sm">No leads found</p>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
                  {leads.map(lead => {
                    const co = lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown'
                    const ct = lead.company_name ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null
                    return (
                      <div key={lead.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700 hover:border-gray-600 transition-colors">
                        <div className="p-2 rounded-full bg-gray-700 text-gray-400 shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{co}</p>
                          <p className="text-gray-500 text-xs truncate">
                            {ct && `${ct} · `}{lead.phone || 'No phone'}{lead.state && ` · ${lead.state}`}
                          </p>
                        </div>
                        {lead.status && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 shrink-0 hidden md:block">
                            {lead.status}
                          </span>
                        )}
                        {lead.phone ? (
                          <button
                            onClick={() => dial(lead)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                          >
                            <Phone className="w-3.5 h-3.5" /> Call
                          </button>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
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
