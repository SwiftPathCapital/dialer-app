import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  let query = db
    .from('inbound_groups')
    .select('*, inbound_group_members(agent_id, agents(id, name, email))')
    .order('name')
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const tenantId = body.agent_id ? await getAgentTenantId(db, body.agent_id) : null

  const { data, error } = await db
    .from('inbound_groups')
    .insert({
      name: body.name,
      phone_number: body.phone_number || null,
      voicemail_enabled: body.voicemail_enabled ?? true,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, members, ...updates } = body
  const db = createServerClient()

  // Only run update() when there are actual fields to change — Supabase rejects update({})
  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('inbound_groups').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sync members if provided
  if (Array.isArray(members)) {
    await db.from('inbound_group_members').delete().eq('group_id', id)
    if (members.length > 0) {
      await db.from('inbound_group_members').insert(
        members.map((agent_id: string) => ({ group_id: id, agent_id }))
      )
    }
  }

  const { data, error } = await db.from('inbound_groups').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('inbound_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
