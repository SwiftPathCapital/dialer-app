'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, PhoneIncoming, PhoneOutgoing, ChevronRight, SkipForward, Phone } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import StatusSelector from '@/components/StatusSelector'
import VoicemailGreeting from '@/components/VoicemailGreeting'
import { Lead, Call } from '@/lib/types'

export default function DashboardPage() {
  const { agent, agentLoading, activeCall, makeCall } = useSoftphone()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [index, setIndex] = useState(0)
  const [callHistory, setCallHistory] = useState<Call[]>([])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    fetch(`/api/leads?agent_id=${agent.id}&limit=200`)
      .then(r => r.json())
      .then(d => setLeads(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [agent, agentLoading, router])

  const lead = leads[index] ?? null

  // Load call history whenever the current lead changes
  useEffect(() => {
    if (!lead?.phone) { setCallHistory([]); return }
    const digits = lead.phone.replace(/\D/g, '')
    fetch(`/api/calls?to_number=${encodeURIComponent(digits)}&limit=10`)
      .then(r => r.json())
      .then(d => setCallHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [lead?.id])

  function dial() {
    if (!lead?.phone) return
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
          <ActiveCall lead={lead} />
          <Dialpad />
          <VoicemailGreeting />
        </div>

        {/* Right: preview dialer */}
        {lead && (
          <div className="flex-1 min-w-72 space-y-4">
            {/* Lead card */}
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

              {/* Actions */}
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

            {/* Previous dials */}
            {callHistory.length > 0 && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Previous Dials</p>
                <div className="space-y-2">
                  {callHistory.map(call => (
                    <div key={call.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                      <span className={`p-2 rounded-full ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                        {call.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
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
