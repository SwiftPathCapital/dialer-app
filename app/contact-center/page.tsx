'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, Phone, PhoneIncoming, PhoneOutgoing, Search, Send, Clock,
} from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { supabase } from '@/lib/supabase'

interface ThreadSummary {
  key: string
  contact_number: string
  sms_conversation_id: string | null
  last_activity_at: string
  last_sms: { body: string; direction: string; at: string } | null
  last_call: { direction: string; status: string; duration_seconds: number | null; at: string } | null
  lead_id: string | null
  lead_name: string | null
}

interface TimelineSmsItem { type: 'sms'; id: string; at: string; direction: string; body: string }
interface TimelineCallItem {
  type: 'call'; id: string; at: string; direction: string; status: string
  disposition: string | null; notes: string | null; duration_seconds: number | null; agent_name: string | null
}
type TimelineItem = TimelineSmsItem | TimelineCallItem

interface ThreadLead {
  id: string; first_name: string | null; last_name: string | null; name: string | null
  company_name: string | null; phone: string | null; email: string | null
  status: string | null; lead_type_label: string | null
}

interface ThreadDetail {
  contact_number: string
  sms_conversation_id: string | null
  our_number: string | null
  lead: ThreadLead | null
  timeline: TimelineItem[]
}

type Filter = 'all' | 'sms' | 'calls'

function leadDisplayName(lead: ThreadLead | null) {
  if (!lead) return null
  return lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || null
}

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return raw
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

function fmtDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ContactCenterPage() {
  const { agent, agentLoading, makeCall, activeCall } = useSoftphone()
  const router = useRouter()

  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(() => {
    fetch('/api/contact-center/threads')
      .then(r => r.json())
      .then(d => { setThreads(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    loadThreads()

    const sub = supabase
      .channel('contact-center')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages' }, loadThreads)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dialer_calls' }, loadThreads)
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [agent, agentLoading, router, loadThreads])

  const loadDetail = useCallback((key: string, number: string) => {
    setDetailLoading(true)
    fetch(`/api/contact-center/thread?number=${encodeURIComponent(number)}`)
      .then(r => r.json())
      .then(d => { setDetail(d); setDetailLoading(false) })
      .catch(() => setDetailLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedKey) return
    const thread = threads.find(t => t.key === selectedKey)
    if (thread) loadDetail(selectedKey, thread.contact_number)
  }, [selectedKey, threads, loadDetail])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [detail?.timeline])

  const filteredThreads = useMemo(() => {
    const term = search.trim().toLowerCase()
    return threads.filter(t => {
      if (filter === 'sms' && !t.last_sms) return false
      if (filter === 'calls' && !t.last_call) return false
      if (!term) return true
      return t.contact_number.includes(term) || (t.lead_name ?? '').toLowerCase().includes(term)
    })
  }, [threads, filter, search])

  function callNow(number: string) {
    if (activeCall) return
    const e164 = number.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
    makeCall(e164, { bypassCooldown: true })
  }

  async function sendReply() {
    if (!draft.trim() || sending || !detail?.sms_conversation_id || !detail.our_number) return
    setSending(true)
    try {
      await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: detail.sms_conversation_id,
          from: detail.our_number,
          to: detail.contact_number,
          body: draft.trim(),
        }),
      })
      setDraft('')
      if (selectedKey) loadDetail(selectedKey, detail.contact_number)
    } finally {
      setSending(false)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendReply()
    }
  }

  if (!agent) return null

  const selectedThread = threads.find(t => t.key === selectedKey) || null
  const contactName = leadDisplayName(detail?.lead ?? null) || (selectedThread ? formatPhone(selectedThread.contact_number) : null)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left rail — threads */}
      <div className="w-80 shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-white font-bold text-lg">Conversations</h1>
          <p className="text-gray-500 text-xs mt-0.5">Every call and text, in one stream.</p>
        </div>

        <div className="px-3 pt-3 flex gap-1">
          {(['all', 'sms', 'calls'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                filter === f ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search threads…"
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-3">
          {loading ? (
            <p className="text-gray-500 text-sm p-4">Loading…</p>
          ) : filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-600 px-4 text-center">
              <MessageSquare className="w-7 h-7 mb-2" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            filteredThreads.map(t => {
              const isSelected = t.key === selectedKey
              const name = t.lead_name || formatPhone(t.contact_number)
              const lastIsCall = t.last_call && (!t.last_sms || t.last_call.at > t.last_sms.at)
              return (
                <button
                  key={t.key}
                  onClick={() => setSelectedKey(t.key)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/60 transition-colors ${
                    isSelected ? 'bg-cyan-900/30 border-l-2 border-l-cyan-500' : 'hover:bg-gray-800/60 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white text-sm font-medium truncate">{name}</p>
                    <span className="text-gray-600 text-[10px] shrink-0">{relTime(t.last_activity_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {lastIsCall ? (
                      t.last_call!.direction === 'inbound'
                        ? <PhoneIncoming className="w-3 h-3 text-green-500 shrink-0" />
                        : <PhoneOutgoing className="w-3 h-3 text-cyan-500 shrink-0" />
                    ) : (
                      <MessageSquare className="w-3 h-3 text-purple-400 shrink-0" />
                    )}
                    <p className="text-gray-500 text-xs truncate">
                      {lastIsCall
                        ? `${t.last_call!.direction === 'inbound' ? 'Inbound' : 'Outbound'} call · ${t.last_call!.status}`
                        : t.last_sms?.body || 'New message'}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Center — unified timeline */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            Select a conversation to begin reading.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-white font-semibold">{contactName}</h2>
                <p className="text-gray-500 text-xs mt-0.5">{formatPhone(selectedThread.contact_number)}</p>
              </div>
              <button
                onClick={() => callNow(selectedThread.contact_number)}
                disabled={!!activeCall}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Phone className="w-3.5 h-3.5" /> Call
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {detailLoading ? (
                <p className="text-gray-500 text-sm">Loading…</p>
              ) : detail?.timeline.length === 0 ? (
                <p className="text-gray-600 text-sm">No activity yet.</p>
              ) : (
                detail?.timeline.map(item => item.type === 'sms' ? (
                  <div key={`sms-${item.id}`} className={`flex ${item.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${
                      item.direction === 'outbound' ? 'bg-cyan-700 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                    }`}>
                      <p>{item.body}</p>
                      <p className={`text-xs mt-1 ${item.direction === 'outbound' ? 'text-cyan-200' : 'text-gray-400'}`}>
                        {new Date(item.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div key={`call-${item.id}`} className="flex justify-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/80 border border-gray-700 text-xs text-gray-400">
                      {item.direction === 'inbound'
                        ? <PhoneIncoming className="w-3 h-3 text-green-500" />
                        : <PhoneOutgoing className="w-3 h-3 text-cyan-500" />}
                      <span>{item.direction === 'inbound' ? 'Inbound' : 'Outbound'} call</span>
                      {item.duration_seconds != null && item.duration_seconds > 0 && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(item.duration_seconds)}</span>
                      )}
                      {item.disposition && <span className="text-gray-300">· {item.disposition}</span>}
                      <span className="text-gray-600">· {new Date(item.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-gray-800 px-4 py-3 flex gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onKey}
                disabled={!detail?.sms_conversation_id}
                placeholder={detail?.sms_conversation_id ? 'Type a message…' : 'No SMS conversation with this contact yet'}
                rows={1}
                className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600 disabled:opacity-50"
              />
              <button
                onClick={sendReply}
                disabled={!draft.trim() || sending || !detail?.sms_conversation_id}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white p-2 rounded-lg transition-colors shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right rail — contact context */}
      <div className="w-72 shrink-0 border-l border-gray-800 overflow-y-auto p-4">
        <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">Contact</p>
        {!selectedThread ? (
          <p className="text-gray-600 text-sm">Open a thread to see contact context.</p>
        ) : (
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-2">
            <p className="text-white text-sm font-medium">{contactName}</p>
            <p className="text-gray-400 text-xs">{formatPhone(selectedThread.contact_number)}</p>
            {detail?.lead ? (
              <>
                {detail.lead.email && <p className="text-gray-400 text-xs">{detail.lead.email}</p>}
                {detail.lead.status && (
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/50 border border-cyan-700/50 text-cyan-200 mt-1">
                    {detail.lead.status}
                  </span>
                )}
                {detail.lead.lead_type_label && <p className="text-gray-500 text-xs mt-2">{detail.lead.lead_type_label}</p>}
              </>
            ) : (
              <p className="text-gray-600 text-xs mt-2">No matching lead on file.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
