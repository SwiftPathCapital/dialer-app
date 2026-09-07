import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function last10(raw: string | null | undefined) {
  return (raw || '').replace(/\D/g, '').slice(-10)
}

interface ThreadAcc {
  key: string
  contact_number: string
  sms_conversation_id: string | null
  last_activity_at: string
  last_sms: { body: string; direction: string; at: string } | null
  last_call: { direction: string; status: string; duration_seconds: number | null; at: string } | null
}

export async function GET() {
  const db = createServerClient()

  const [{ data: convos }, { data: calls }, { data: messages }] = await Promise.all([
    db.from('sms_conversations').select('id, contact_number, our_number, last_message_at'),
    db.from('dialer_calls')
      .select('id, direction, from_number, to_number, status, duration_seconds, started_at')
      .not('telnyx_call_control_id', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1000),
    db.from('sms_messages').select('conversation_id, body, direction, sent_at').order('sent_at', { ascending: false }),
  ])

  // Most recent message per conversation — messages arrive sorted desc, so the first hit per id wins.
  const lastMsgByConvo = new Map<string, { body: string; direction: string; sent_at: string }>()
  for (const m of messages || []) {
    if (!lastMsgByConvo.has(m.conversation_id)) {
      lastMsgByConvo.set(m.conversation_id, { body: m.body, direction: m.direction, sent_at: m.sent_at })
    }
  }

  const threads = new Map<string, ThreadAcc>()
  function getOrCreate(key: string, contactNumber: string): ThreadAcc {
    let t = threads.get(key)
    if (!t) {
      t = { key, contact_number: contactNumber, sms_conversation_id: null, last_activity_at: '', last_sms: null, last_call: null }
      threads.set(key, t)
    }
    return t
  }

  for (const c of convos || []) {
    const key = last10(c.contact_number)
    if (!key) continue
    const t = getOrCreate(key, c.contact_number)
    t.sms_conversation_id = c.id
    const lastMsg = lastMsgByConvo.get(c.id)
    const at = c.last_message_at || lastMsg?.sent_at
    if (at) {
      if (!t.last_sms || at > t.last_sms.at) {
        t.last_sms = { body: lastMsg?.body ?? '', direction: lastMsg?.direction ?? 'outbound', at }
      }
      if (at > t.last_activity_at) t.last_activity_at = at
    }
  }

  for (const c of calls || []) {
    const raw = c.direction === 'inbound' ? c.from_number : c.to_number
    const key = last10(raw)
    if (!key) continue
    const t = getOrCreate(key, raw || key)
    if (!t.last_call || c.started_at > t.last_call.at) {
      t.last_call = { direction: c.direction, status: c.status, duration_seconds: c.duration_seconds, at: c.started_at }
    }
    if (c.started_at > t.last_activity_at) t.last_activity_at = c.started_at
  }

  const list = Array.from(threads.values()).filter(t => t.last_activity_at)

  // Enrich with lead name by matching phone digits — same substring-match convention used elsewhere.
  let leadsByKey = new Map<string, { id: string; display: string }>()
  if (list.length > 0) {
    const orFilter = list.map(t => `phone.ilike.%${t.key}%`).join(',')
    const { data: leads } = await db
      .from('leads')
      .select('id, first_name, last_name, name, company_name, phone')
      .or(orFilter)

    for (const lead of leads || []) {
      const k = last10(lead.phone)
      if (!k) continue
      const display = lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || ''
      if (display) leadsByKey.set(k, { id: lead.id, display })
    }
  }

  const result = list
    .map(t => ({
      key: t.key,
      contact_number: t.contact_number,
      sms_conversation_id: t.sms_conversation_id,
      last_activity_at: t.last_activity_at,
      last_sms: t.last_sms,
      last_call: t.last_call,
      lead_id: leadsByKey.get(t.key)?.id ?? null,
      lead_name: leadsByKey.get(t.key)?.display ?? null,
    }))
    .sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1))

  return NextResponse.json(result)
}
