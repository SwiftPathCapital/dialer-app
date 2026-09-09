'use client'

import { useEffect, useState } from 'react'
import { Mic, MicOff, Pause, Play, PhoneOff, Phone, Clock, X } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { Lead, Call } from '@/lib/types'

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  )
}

export default function LeadPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { activeCall, hangupCall, toggleHold, toggleMute, answerCall, muted } = useSoftphone()
  const [elapsed, setElapsed] = useState(0)
  const [history, setHistory] = useState<Call[]>([])

  useEffect(() => {
    if (activeCall?.state !== 'active') { setElapsed(0); return }
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [activeCall?.state])

  useEffect(() => {
    if (!lead.phone) return
    const digits = lead.phone.replace(/\D/g, '')
    fetch(`/api/calls?to_number=${encodeURIComponent(digits)}&limit=20`)
      .then(r => r.json())
      .then(d => setHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [lead.id])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const company = lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown'
  const contact = lead.company_name
    ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || null
    : null

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-700">
        <div className="min-w-0">
          <p className="text-white font-semibold text-base truncate">{company}</p>
          {contact && <p className="text-gray-400 text-sm">{contact}</p>}
          <p className="text-gray-500 text-xs mt-0.5">{lead.phone}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-3 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Active call status + controls */}
      {activeCall && (
        <div className="px-5 py-4 border-b border-gray-700 bg-gray-900/40">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 uppercase tracking-widest">
              {activeCall.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
            </span>
            {activeCall.state === 'ringing' && <span className="text-yellow-400 text-sm animate-pulse">Ringing…</span>}
            {activeCall.state === 'active' && <span className="text-green-400 font-mono text-sm">{mm}:{ss}</span>}
            {activeCall.state === 'held' && <span className="text-blue-400 text-sm">On Hold</span>}
          </div>

          {activeCall.state === 'ringing' && activeCall.direction === 'inbound' && (
            <button onClick={answerCall} className="w-full mb-2 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold">
              Answer
            </button>
          )}

          <div className="flex gap-2">
            {activeCall.state === 'active' && (
              <>
                <button onClick={toggleMute} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${muted ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? 'Unmute' : 'Mute'}
                </button>
                <button onClick={toggleHold} className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm font-medium flex items-center justify-center gap-1.5">
                  <Pause className="w-4 h-4" /> Hold
                </button>
              </>
            )}
            {activeCall.state === 'held' && (
              <button onClick={toggleHold} className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium flex items-center justify-center gap-1.5">
                <Play className="w-4 h-4" /> Resume
              </button>
            )}
            {activeCall.state !== 'ringing' && (
              <button onClick={hangupCall} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5">
                <PhoneOff className="w-4 h-4" /> Hang Up
              </button>
            )}
            {activeCall.state === 'ringing' && (
              <button onClick={hangupCall} className="flex-1 py-2 rounded-lg text-red-400 hover:text-red-300 text-sm">
                Decline
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Lead info */}
        <div className="space-y-2">
          <p className="text-gray-500 text-xs uppercase tracking-widest">Lead Info</p>
          <InfoRow label="Email" value={lead.email} />
          <InfoRow label="State" value={lead.state ? `${lead.city ? lead.city + ', ' : ''}${lead.state}` : lead.city} />
          <InfoRow label="Status" value={lead.status} />
          <InfoRow label="Type" value={lead.lead_type_label || lead.lead_type} />
          <InfoRow label="Revenue" value={lead.revenue} />
          <InfoRow label="Monthly Deposits" value={lead.monthly_deposit} />
          <InfoRow label="Requested" value={lead.requested_amount} />
          <InfoRow label="Time in Business" value={lead.tib} />
          <InfoRow label="FICO" value={lead.fico} />
          <InfoRow label="Employees" value={lead.employee_size} />
          <InfoRow label="Why Funds" value={lead.why_funds} />
        </div>

        {/* Call history */}
        <div className="space-y-2">
          <p className="text-gray-500 text-xs uppercase tracking-widest">Call History</p>
          {history.length === 0 ? (
            <p className="text-gray-600 text-xs">No previous calls</p>
          ) : (
            <div className="space-y-1.5">
              {history.map(call => (
                <div key={call.id} className="flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-2">
                  <Phone className="w-3 h-3 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-xs">{new Date(call.started_at).toLocaleString()}</p>
                    <p className="text-gray-500 text-xs">{call.status}</p>
                  </div>
                  {call.duration_seconds != null && (
                    <div className="flex items-center gap-1 text-gray-500 text-xs shrink-0">
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
    </div>
  )
}
