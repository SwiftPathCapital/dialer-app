import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const { id, disposition, notes } = await req.json()
  const db = createServerClient()
  const { error } = await db
    .from('dialer_calls')
    .update({ disposition: disposition ?? null, notes: notes ?? null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id') || ''
  const limit = parseInt(searchParams.get('limit') || '200')

  const db = createServerClient()

  // When filtering by agent, also include inbound group calls for their groups
  let groupIds: string[] = []
  if (agentId) {
    const { data: memberships } = await db
      .from('inbound_group_members')
      .select('group_id')
      .eq('agent_id', agentId)
    groupIds = memberships?.map((m: { group_id: string }) => m.group_id) ?? []
  }

  let query = db
    .from('dialer_calls')
    .select('id, direction, from_number, to_number, status, disposition, notes, duration_seconds, started_at, agent_id, group_id, agents(id, name, email)')
    .not('telnyx_call_control_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (agentId && groupIds.length > 0) {
    query = query.or(`agent_id.eq.${agentId},group_id.in.(${groupIds.join(',')})`)
  } else if (agentId) {
    query = query.eq('agent_id', agentId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
