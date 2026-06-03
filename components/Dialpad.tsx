'use client'

import { useState } from 'react'
import { Phone, Delete } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

export default function Dialpad() {
  const [number, setNumber] = useState('')
  const { makeCall, activeCall, connected, agent } = useSoftphone()

  function press(key: string) {
    setNumber(prev => prev + key)
    // Send DTMF if a call is active
    if (activeCall?.telnyxCall && activeCall.state === 'active') {
      activeCall.telnyxCall.dtmf(key)
    }
  }

  function handleCall() {
    if (!number.trim()) return
    const digits = number.replace(/\D/g, '')
    const e164 = digits.replace(/^1?(\d{10})$/, '+1$1')
    makeCall(e164.startsWith('+') ? e164 : number.trim(), { bypassCooldown: true })
    setNumber('')
  }

  const canCall = connected && !!agent && !activeCall && number.trim().length > 0

  return (
    <div className="bg-gray-800 rounded-xl p-5 w-full max-w-xs">
      {/* Number display */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="tel"
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="flex-1 bg-gray-900 text-white text-xl text-center rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
        />
        {number && (
          <button
            onClick={() => setNumber(prev => prev.slice(0, -1))}
            className="text-gray-400 hover:text-white"
          >
            <Delete className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Keys */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {KEYS.flat().map(key => (
          <button
            key={key}
            onClick={() => press(key)}
            className="bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white font-semibold text-lg rounded-lg py-3 transition-colors"
          >
            {key}
          </button>
        ))}
      </div>

      {/* Call button */}
      <button
        onClick={handleCall}
        disabled={!canCall}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-white transition-colors ${
          canCall
            ? 'bg-green-600 hover:bg-green-500'
            : 'bg-gray-700 opacity-40 cursor-not-allowed'
        }`}
      >
        <Phone className="w-5 h-5" />
        Call
      </button>

      {!connected && (
        <p className="text-center text-xs text-gray-500 mt-3">
          {agent ? 'Connecting softphone...' : 'Sign in to make calls'}
        </p>
      )}
    </div>
  )
}
