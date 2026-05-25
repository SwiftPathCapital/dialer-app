'use client'

import { Mic, MicOff, Pause, Play, PhoneOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { useEffect, useState } from 'react'
import { Lead } from '@/lib/types'

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-300 text-right truncate">{value}</span>
    </div>
  )
}

export default function ActiveCall({ lead }: { lead?: Lead | null }) {
  const { activeCall, hangupCall, toggleHold, toggleMute, answerCall, muted } = useSoftphone()
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (activeCall?.state !== 'active') {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [activeCall?.state])

  if (!activeCall) return null

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  const company = lead ? (lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name) : null
  const contact = lead?.company_name ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null

  return (
    <div className="bg-gray-800 rounded-xl p-5 w-full max-w-xs border border-gray-700">
      {/* Header */}
      <div className="text-center mb-4">
        {activeCall.groupName ? (
          <>
            <span className="inline-block bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-1">
              {activeCall.groupName}
            </span>
            <p className="text-white text-xl font-semibold">{activeCall.remoteNumber}</p>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
              {activeCall.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
            </p>
            {company ? (
              <>
                <p className="text-white text-xl font-semibold truncate">{company}</p>
                <p className="text-gray-400 text-sm mt-0.5">{activeCall.remoteNumber}</p>
              </>
            ) : (
              <p className="text-white text-xl font-semibold">{activeCall.remoteNumber}</p>
            )}
          </>
        )}
        <p className="text-sm mt-1">
          {activeCall.state === 'ringing' && <span className="text-yellow-400 animate-pulse">Ringing...</span>}
          {activeCall.state === 'active' && <span className="text-green-400 font-mono">{mm}:{ss}</span>}
          {activeCall.state === 'held' && <span className="text-blue-400">On Hold</span>}
        </p>
      </div>

      {/* Lead quick info — hidden for group inbound calls */}
      {lead && !activeCall.groupName && (
        <div className="mb-4 space-y-1.5 border-t border-gray-700 pt-3">
          <InfoRow label="Contact" value={contact} />
          <InfoRow label="State" value={lead.state} />
          <InfoRow label="Status" value={lead.status} />
          <InfoRow label="Type" value={lead.lead_type_label || lead.lead_type} />

          {/* Expandable MCA details */}
          {expanded && (
            <>
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Revenue" value={lead.revenue} />
              <InfoRow label="Monthly Dep." value={lead.monthly_deposit} />
              <InfoRow label="Requested" value={lead.requested_amount} />
              <InfoRow label="TIB" value={lead.tib} />
              <InfoRow label="FICO" value={lead.fico} />
              <InfoRow label="Employees" value={lead.employee_size} />
              <InfoRow label="Why Funds" value={lead.why_funds} />
            </>
          )}

          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors pt-0.5"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less' : 'More details'}
          </button>
        </div>
      )}

      {/* Answer button (inbound ringing only) */}
      {activeCall.state === 'ringing' && activeCall.direction === 'inbound' && (
        <button
          onClick={answerCall}
          className="w-full mb-3 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold flex items-center justify-center gap-2"
        >
          Answer
        </button>
      )}

      {/* Controls (active call) */}
      {activeCall.state === 'active' && (
        <div className="flex justify-center gap-4 mb-4">
          <button
            onClick={toggleMute}
            title={muted ? 'Unmute' : 'Mute'}
            className={`p-3 rounded-full transition-colors ${muted ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button
            onClick={toggleHold}
            title="Hold"
            className="p-3 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>
      )}

      {activeCall.state === 'held' && (
        <div className="flex justify-center mb-4">
          <button
            onClick={toggleHold}
            title="Resume"
            className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            <Play className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Hangup */}
      {activeCall.state !== 'ringing' && (
        <button
          onClick={hangupCall}
          className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center justify-center gap-2"
        >
          <PhoneOff className="w-5 h-5" />
          Hang Up
        </button>
      )}

      {activeCall.state === 'ringing' && (
        <button
          onClick={hangupCall}
          className="w-full py-2 rounded-lg text-red-400 hover:text-red-300 text-sm transition-colors"
        >
          Decline
        </button>
      )}
    </div>
  )
}
