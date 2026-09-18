import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'
import { sendSms } from '@/lib/sms'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversation_id')
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()

  if (conversationId) {
    const { data, error } = await db
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null
  let query = db.from('sms_conversations').select('*').order('last_message_at', { ascending: false })
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { conversation_id, from, to, body, agent_id } = await req.json()

  try {
    const data = await sendSms({ from, to, body, agentId: agent_id, conversationId: conversation_id })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send SMS' }, { status: 500 })
  }
}
