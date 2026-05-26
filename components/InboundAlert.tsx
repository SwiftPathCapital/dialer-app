'use client'

import { Phone, PhoneOff } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

const GROUP_COLORS: Record<string, string> = {
  'SD Live transfers': 'bg-blue-500',
}

function groupColor(name: string) {
  if (GROUP_COLORS[name]) return GROUP_COLORS[name]
  // Deterministic fallback color from name hash
  const colors = ['bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xff
  return colors[hash % colors.length]
}

export default function InboundAlert() {
  const { activeCall, answerCall, hangupCall } = useSoftphone()

  if (!activeCall || activeCall.state !== 'ringing' || activeCall.direction !== 'inbound') {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl p-5 w-72 animate-in slide-in-from-bottom-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Incoming Call</p>
      {activeCall.groupName && (
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold text-white ${groupColor(activeCall.groupName)}`}>
            {activeCall.groupName}
          </span>
        </div>
      )}
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
