'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import StatusSelector from '@/components/StatusSelector'
import { Call } from '@/lib/types'
import VoicemailGreeting from '@/components/VoicemailGreeting'

export default function DashboardPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [recentCalls, setRecentCalls] = useState<Call[]>([])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    fetch(`/api/calls?agent_id=${agent.id}&limit=20`)
      .then(r => r.json())
      .then(data => setRecentCalls(Array.isArray(data) ? data : []))
      .catch(console.error)
  }, [agent, router])

  if (!agent) return null

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
        {/* Dialpad / Active call */}
        <div className="space-y-4">
          <ActiveCall />
          <Dialpad />
          <VoicemailGreeting />
        </div>

        {/* Recent calls */}
        <div className="flex-1 min-w-72">
          <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Recent Calls</p>
          {recentCalls.length === 0 ? (
            <p className="text-gray-600 text-sm">No calls yet</p>
          ) : (
            <div className="space-y-2">
              {recentCalls.map(call => (
                <div key={call.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                  <span className={`p-2 rounded-full ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                    {call.direction === 'inbound'
                      ? <PhoneIncoming className="w-4 h-4" />
                      : <PhoneOutgoing className="w-4 h-4" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {call.direction === 'inbound' ? call.from_number : call.to_number}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {new Date(call.started_at).toLocaleString()} · {call.status}
                    </p>
                  </div>
                  {call.duration_seconds != null && (
                    <div className="flex items-center gap-1 text-gray-400 text-xs">
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
