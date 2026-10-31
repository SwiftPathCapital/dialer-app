import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized, forbidden, type Caller } from '@/lib/caller'
import { sendSms } from '@/lib/sms'

type Db = ReturnType<typeof createServerClient>

const last10 = (raw: string | null | undefined) => (raw || '').replace(/\D/g, '').slice(-10)

// Numbers this account may text from: its agents' DIDs, its inbound group numbers, its
// local presence numbers, and any number it already has conversations on.
async function tenantOwnsNumber(db: Db, caller: Caller, number: string): Promise<boolean> {
  const key = last10(number)
  if (!key) return false
  const [{ data: agents }, { data: groups }, { data: local }, { data: convos }] = await Promise.all([
    db.from('agents').select('did').eq('tenant_id', caller.tenantId).not('did', 'is', null),
    db.from('inbound_groups').select('phone_number').eq('tenant_id', caller.tenantId).not('phone_number', 'is', null),
    db.from('dialer_caller_ids').select('phone_number').eq('tenant_id', caller.tenantId),
    db.from('sms_conversations').select('our_number').eq('tenant_id', caller.tenantId).ilike('our_number', `%${key}`).limit(1),
  ])
  return [
    ...(agents ?? []).map(a => a.did),
    ...(groups ?? []).map(g => g.phone_number),
    ...(local ?? []).map(n => n.phone_number),
    ...(convos ?? []).map(c => c.our_number),
  ].some(n => last10(n) === key)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversation_id')
  const caller = await getCaller()
  if (!caller) return unauthorized()

  const db = createServerClient()

  if (conversationId) {
    const { data: convo } = await db.from('sms_conversations').select('id').eq('id', conversationId).eq('tenant_id', caller.tenantId).maybeSingle()
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const { data, error } = await db
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await db
    .from('sms_conversations')
    .select('*')
    .eq('tenant_id', caller.tenantId)
    .order('last_message_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { conversation_id, from, to, body } = await req.json()
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!body?.trim()) return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
  const db = createServerClient()

  let sendFrom: string = from
  let sendTo: string = to
  if (conversation_id) {
    // Replying in a thread: the numbers come from the thread, not the browser.
    const { data: convo } = await db
      .from('sms_conversations')
      .select('our_number, contact_number')
      .eq('id', conversation_id)
      .eq('tenant_id', caller.tenantId)
      .maybeSingle()
    if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    sendFrom = convo.our_number
    sendTo = convo.contact_number
  } else {
    if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    if (!(await tenantOwnsNumber(db, caller, from))) return forbidden('You can only text from your account\'s numbers.')
  }

  try {
    const data = await sendSms({ from: sendFrom, to: sendTo, body, agentId: caller.id, conversationId: conversation_id })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send SMS' }, { status: 500 })
  }
}
