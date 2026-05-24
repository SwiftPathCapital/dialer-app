'use client'

import { Mic, MicOff, Pause, Play, PhoneOff } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { useEffect, useState } from 'react'

export default function ActiveCall() {
  const { activeCall, hangupCall, toggleHold, toggleMute, answerCall, muted } = useSoftphone()
  const [elapsed, setElapsed] = useState(0)

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

  return (
    <div className="bg-gray-800 rounded-xl p-5 w-full max-w-xs border border-gray-700">
      <div className="text-center mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
          {activeCall.direction === 'inbound' ? 'Incoming' : 'Outgoing'}
        </p>
        <p className="text-white text-xl font-semibold">{activeCall.remoteNumber}</p>
        <p className="text-sm mt-1">
          {activeCall.state === 'ringing' && (
            <span className="text-yellow-400 animate-pulse">Ringing...</span>
          )}
          {activeCall.state === 'active' && (
            <span className="text-green-400 font-mono">{mm}:{ss}</span>
          )}
          {activeCall.state === 'held' && (
            <span className="text-blue-400">On Hold</span>
          )}
        </p>
      </div>

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

      {/* Decline for inbound ringing */}
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
