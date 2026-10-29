import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'

function last10(raw: string | null | undefined) {
  return (raw || '').replace(/\D/g, '').slice(-10)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const number = searchParams.get('number') || ''
  const key = last10(number)
  if (!key) return NextResponse.json({ error: 'number is required' }, { status: 400 })
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const tenantId = caller.tenantId

  const db = createServerClient()
  const { data: convos } = await db.from('sms_conversations').select('id, contact_number, our_number').eq('tenant_id', tenantId)
  const convo = (convos || []).find(c => last10(c.contact_number) === key) || null

  const callsQuery = db.from('dialer_calls')
    .select('id, direction, from_number, to_number, status, disposition, notes, duration_seconds, started_at, agents(id, name)')
    .not('telnyx_call_control_id', 'is', null)
    .or(`from_number.ilike.%${key}%,to_number.ilike.%${key}%`)
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: true })
    .limit(500)
  const leadsQuery = db.from('leads').select('id, first_name, last_name, name, company_name, phone, email, status, lead_type_label').ilike('phone', `%${key}%`).eq('tenant_id', tenantId).limit(1)

  const [{ data: messages }, { data: calls }, { data: leads }] = await Promise.all([
    convo
      ? db.from('sms_messages').select('id, direction, body, sent_at').eq('conversation_id', convo.id).order('sent_at', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; direction: string; body: string; sent_at: string }[] }),
    callsQuery,
    leadsQuery,
  ])

  const relevantCalls = (calls || []).filter(c => {
    const raw = c.direction === 'inbound' ? c.from_number : c.to_number
    return last10(raw) === key
  })

  const timeline = [
    ...(messages || []).map(m => ({ type: 'sms' as const, id: m.id, at: m.sent_at, direction: m.direction, body: m.body })),
    ...relevantCalls.map(c => ({
      type: 'call' as const,
      id: c.id,
      at: c.started_at,
      direction: c.direction,
      status: c.status,
      disposition: c.disposition,
      notes: c.notes,
      duration_seconds: c.duration_seconds,
      agent_name: (c.agents as unknown as { name: string } | null)?.name ?? null,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const firstCallRaw = relevantCalls[0]
    ? (relevantCalls[0].direction === 'inbound' ? relevantCalls[0].from_number : relevantCalls[0].to_number)
    : null

  return NextResponse.json({
    contact_number: convo?.contact_number || firstCallRaw || number,
    sms_conversation_id: convo?.id ?? null,
    our_number: convo?.our_number ?? null,
    lead: (leads || [])[0] ?? null,
    timeline,
  })
}
