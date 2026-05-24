'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { AgentStatus } from '@/lib/types'

const OPTIONS: { value: AgentStatus; label: string; color: string }[] = [
  { value: 'available', label: 'Available', color: 'bg-green-500' },
  { value: 'busy', label: 'Busy', color: 'bg-yellow-500' },
  { value: 'offline', label: 'Offline', color: 'bg-gray-500' },
]

export default function StatusSelector() {
  const { agent, setAgent } = useSoftphone()
  const [open, setOpen] = useState(false)

  if (!agent) return null

  const current = OPTIONS.find(o => o.value === agent.status) || OPTIONS[2]

  async function select(status: AgentStatus) {
    setOpen(false)
    if (!agent) return

    const updated = { ...agent, status }
    setAgent(updated)

    await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agent.id, status }),
    })
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg text-sm text-white hover:bg-gray-700 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${current.color}`} />
        {current.label}
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden">
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => select(opt.value)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-gray-700 ${
                agent.status === opt.value ? 'text-white' : 'text-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${opt.color}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
