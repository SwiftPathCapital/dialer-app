import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAgentTenantId } from '@/lib/caller'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agentId)
  if (!tenantId) return NextResponse.json([])

  const query = db.from('calendar_groups').select('id, name, sort_order').eq('tenant_id', tenantId).order('sort_order').order('name')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, agent_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agent_id)
  if (!tenantId) return NextResponse.json({ error: 'Unknown account' }, { status: 400 })

  const { data, error } = await db
    .from('calendar_groups')
    .insert({ name: name.trim(), tenant_id: tenantId })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, name } = await req.json()
  if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name are required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db)
  const { data, error } = await db.from('calendar_groups').update({ name: name.trim() }).eq('id', id).eq('tenant_id', tenantId ?? '').select().maybeSingle()
  if (!error && !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db)
  // calendars.group_id is ON DELETE SET NULL, so member calendars are ungrouped, not deleted.
  const { error } = await db.from('calendar_groups').delete().eq('id', id).eq('tenant_id', tenantId ?? '')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
