'use client'

import { Phone, PhoneOff, PhoneMissed } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { ActiveCall } from '@/lib/SoftphoneContext'

const GROUP_COLORS: Record<string, string> = {
  'SD Live transfers': 'bg-blue-500',
}

function groupColor(name: string) {
  if (GROUP_COLORS[name]) return GROUP_COLORS[name]
  const colors = ['bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xff
  return colors[hash % colors.length]
}

function CallerInfo({ call }: { call: ActiveCall }) {
  return (
    <>
      {call.groupName && (
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold text-white ${groupColor(call.groupName)}`}>
            {call.groupName}
          </span>
        </div>
      )}
      {call.callerName && (
        <p className="text-white font-semibold leading-tight">{call.callerName}</p>
      )}
      <p className={call.callerName ? 'text-gray-400 text-sm' : 'text-white font-semibold'}>
        {call.remoteNumber}
      </p>
    </>
  )
}

export default function InboundAlert() {
  const { activeCall, waitingCall, answerCall, hangupCall, answerWaiting, rejectWaiting } = useSoftphone()

  // ── Call waiting (already on a call, new inbound arrives) ─────────────────
  if (waitingCall) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-yellow-500/60 rounded-2xl shadow-2xl p-5 w-72 animate-in slide-in-from-bottom-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <p className="text-xs text-yellow-400 uppercase tracking-widest font-medium">Incoming — On Other Line</p>
        </div>
        <CallerInfo call={waitingCall} />
        <div className="flex gap-3 mt-4">
          <button
            onClick={answerWaiting}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
          >
            <Phone className="w-4 h-4" />
            Answer &amp; Hold
          </button>
          <button
            onClick={rejectWaiting}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors"
          >
            <PhoneMissed className="w-4 h-4" />
            Decline
          </button>
        </div>
      </div>
    )
  }

  // ── Normal inbound ringing (not yet on a call) ────────────────────────────
  if (!activeCall || activeCall.state !== 'ringing' || activeCall.direction !== 'inbound') {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl p-5 w-72 animate-in slide-in-from-bottom-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Incoming Call</p>
      <CallerInfo call={activeCall} />
      <div className="flex gap-3 mt-4">
        <button
          onClick={answerCall}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
        >
          <Phone className="w-4 h-4" />
          Answer
        </button>
        <button
          onClick={hangupCall}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          Decline
        </button>
      </div>
    </div>
  )
}
