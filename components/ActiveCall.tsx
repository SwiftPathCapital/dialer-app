'use client'

import { Mic, MicOff, Pause, Play, PhoneOff, ChevronDown, ChevronUp, Phone, UserPlus, GitMerge, X } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { useEffect, useRef, useState } from 'react'
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
  const {
    activeCall, heldCall, hangupCall, resumeHeld, toggleHold, toggleMute,
    answerCall, muted, addPartyCall, mergeConference, conferenceStatus,
  } = useSoftphone()

  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [showAddParty, setShowAddParty] = useState(false)
  const [addPartyNumber, setAddPartyNumber] = useState('')
  const addPartyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeCall?.state !== 'active') {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [activeCall?.state])

  // Close add-party panel when call ends or goes on hold
  useEffect(() => {
    if (!activeCall || activeCall.state !== 'active') {
      setShowAddParty(false)
      setAddPartyNumber('')
    }
  }, [activeCall?.state])

  useEffect(() => {
    if (showAddParty) addPartyInputRef.current?.focus()
  }, [showAddParty])

  if (!activeCall) return null

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  const company = lead
    ? (lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name)
    : (activeCall.callerName || null)
  const contact = lead?.company_name ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null

  function handleAddPartyDial() {
    const num = addPartyNumber.trim()
    if (!num) return
    addPartyCall(num)
    setShowAddParty(false)
    setAddPartyNumber('')
  }

  return (
    <div className="space-y-2 w-full max-w-xs">
      {/* ── Conference badge ──────────────────────────────────────────────── */}
      {conferenceStatus === 'active' && (
        <div className="flex items-center justify-center gap-2 bg-purple-900/50 border border-purple-600/50 rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          <span className="text-purple-300 text-xs font-bold uppercase tracking-widest">Conference Active</span>
        </div>
      )}
      {conferenceStatus === 'dialing' && (
        <div className="flex items-center justify-center gap-2 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-yellow-300 text-xs font-medium">Merging calls…</span>
        </div>
      )}

      {/* ── Active / held call card ──────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
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
            {activeCall.state === 'held' && <span className="text-blue-400 animate-pulse">On Hold…</span>}
          </p>
        </div>

        {/* Lead quick info */}
        {lead && !activeCall.groupName && (
          <div className="mb-4 space-y-1.5 border-t border-gray-700 pt-3">
            <InfoRow label="Contact" value={contact} />
            <InfoRow label="State" value={lead.state} />
            <InfoRow label="Status" value={lead.status} />
            <InfoRow label="Type" value={lead.lead_type_label || lead.lead_type} />
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

        {/* Answer button (inbound ringing) */}
        {activeCall.state === 'ringing' && activeCall.direction === 'inbound' && (
          <button
            onClick={answerCall}
            className="w-full mb-3 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold flex items-center justify-center gap-2"
          >
            Answer
          </button>
        )}

        {/* Controls (active) */}
        {activeCall.state === 'active' && (
          <>
            <div className="flex justify-center gap-4 mb-3">
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
              {/* Add Party — only when not already managing a held call */}
              {!heldCall && conferenceStatus === 'idle' && (
                <button
                  onClick={() => setShowAddParty(v => !v)}
                  title="Add party"
                  className={`p-3 rounded-full transition-colors ${showAddParty ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  <UserPlus className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Add Party number input */}
            {showAddParty && (
              <div className="mb-3 flex gap-2">
                <input
                  ref={addPartyInputRef}
                  type="tel"
                  value={addPartyNumber}
                  onChange={e => setAddPartyNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddPartyDial() }}
                  placeholder="Number to dial…"
                  className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-500"
                />
                <button
                  onClick={handleAddPartyDial}
                  disabled={!addPartyNumber.trim()}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setShowAddParty(false); setAddPartyNumber('') }}
                  className="px-2 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Resume button (held) */}
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
            {conferenceStatus === 'active' ? 'Leave Conference' : 'Hang Up'}
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

      {/* ── Held call strip ───────────────────────────────────────────────── */}
      {heldCall && (
        <div className="bg-gray-900 rounded-xl px-4 py-3 border border-blue-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-blue-400 text-[10px] font-bold uppercase tracking-widest">On Hold</p>
            <p className="text-white text-sm font-medium truncate">
              {heldCall.callerName || heldCall.remoteNumber}
            </p>
            {heldCall.callerName && (
              <p className="text-gray-500 text-xs truncate">{heldCall.remoteNumber}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {/* Merge — only available when active call is connected */}
            {activeCall.state === 'active' && conferenceStatus !== 'active' && (
              <button
                onClick={mergeConference}
                disabled={conferenceStatus === 'dialing'}
                title="Merge into conference"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Merge
              </button>
            )}
            <button
              onClick={resumeHeld}
              title="Switch to held call (hangs up current)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Switch
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
