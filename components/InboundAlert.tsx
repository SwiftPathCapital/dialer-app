'use client'

import { Phone, PhoneOff } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

export default function InboundAlert() {
  const { activeCall, answerCall, hangupCall } = useSoftphone()

  if (!activeCall || activeCall.state !== 'ringing' || activeCall.direction !== 'inbound') {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl p-5 w-72 animate-in slide-in-from-bottom-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
        {activeCall.groupName ? `Group Call — ${activeCall.groupName}` : 'Incoming Call'}
      </p>
      <p className="text-white text-lg font-semibold mb-4">{activeCall.remoteNumber}</p>
      <div className="flex gap-3">
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
