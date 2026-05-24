'use client'

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SMSConversation, SMSMessage } from '@/lib/types'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Props {
  conversation: SMSConversation
}

export default function SMSThread({ conversation }: Props) {
  const [messages, setMessages] = useState<SMSMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { agent } = useSoftphone()

  useEffect(() => {
    fetch(`/api/sms?conversation_id=${conversation.id}`)
      .then(r => r.json())
      .then(setMessages)
      .catch(console.error)

    const sub = supabase
      .channel(`sms-${conversation.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => setMessages(prev => [...prev, payload.new as SMSMessage])
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [conversation.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          from: conversation.our_number,
          to: conversation.contact_number,
          body: draft.trim(),
        }),
      })
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-700 px-5 py-4">
        <p className="text-white font-semibold">{conversation.contact_number}</p>
        <p className="text-gray-500 text-xs">via {conversation.our_number}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${
                msg.direction === 'outbound'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-700 text-gray-100 rounded-bl-sm'
              }`}
            >
              <p>{msg.body}</p>
              <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="border-t border-gray-700 px-4 py-3 flex gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
        />
        <button
          onClick={send}
          disabled={!draft.trim() || sending}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
