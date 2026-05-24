'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { supabase } from '@/lib/supabase'
import { SMSConversation } from '@/lib/types'
import SMSThread from '@/components/SMSThread'

export default function SMSPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [conversations, setConversations] = useState<SMSConversation[]>([])
  const [selected, setSelected] = useState<SMSConversation | null>(null)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }

    fetch('/api/sms')
      .then(r => r.json())
      .then(data => setConversations(Array.isArray(data) ? data : []))
      .catch(console.error)

    const sub = supabase
      .channel('sms-convos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_conversations' }, () => {
        fetch('/api/sms').then(r => r.json()).then(data => setConversations(Array.isArray(data) ? data : []))
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [agent, router])

  if (!agent) return null

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-72 shrink-0 border-r border-gray-700 overflow-y-auto">
        <div className="px-4 py-5 border-b border-gray-700">
          <h1 className="text-lg font-bold text-white">SMS</h1>
        </div>
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-600">
            <MessageSquare className="w-8 h-8 mb-2" />
            <p className="text-sm">No conversations yet</p>
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setSelected(conv)}
              className={`w-full text-left px-4 py-4 border-b border-gray-800 transition-colors ${
                selected?.id === conv.id ? 'bg-blue-900/30' : 'hover:bg-gray-800'
              }`}
            >
              <p className="text-white font-medium text-sm">{conv.contact_number}</p>
              <p className="text-gray-500 text-xs mt-0.5">via {conv.our_number}</p>
              {conv.last_message_at && (
                <p className="text-gray-600 text-xs mt-1">
                  {new Date(conv.last_message_at).toLocaleString()}
                </p>
              )}
            </button>
          ))
        )}
      </div>

      {/* Thread */}
      <div className="flex-1">
        {selected ? (
          <SMSThread conversation={selected} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            <p>Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}
