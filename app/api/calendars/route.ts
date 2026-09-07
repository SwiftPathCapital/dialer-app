import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenCalendar(row: any) {
  const { calendar_members, calendar_visibility, ...rest } = row
  const membership = (calendar_members ?? [])[0] ?? null
  const visibility = (calendar_visibility ?? [])[0] ?? null
  return {
    ...rest,
    can_edit: membership ? !!membership.can_edit : false,
    visible: visibility ? !!visibility.visible : true, // default-on until a user explicitly hides it
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const all = searchParams.get('all') === 'true'

  const db = createServerClient()

  if (all) {
    // Admin console view: every calendar in the requesting admin's tenant, with its member list.
    if (!agentId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    const tenantId = await getAgentTenantId(db, agentId)
    if (!tenantId) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })

    const { data, error } = await db
      .from('calendars')
      .select('id, name, color, type, owner_agent_id, group_id, created_at, calendar_groups(id, name), calendar_members(agent_id, can_edit, agents(id, name))')
      .eq('tenant_id', tenantId)
      .order('type', { ascending: false }) // team calendars first
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (!agentId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

  // A given agent's own calendars: personal + any team calendar they're a member of.
  const { data, error } = await db
    .from('calendars')
    .select('id, name, color, type, owner_agent_id, group_id, created_at, calendar_groups(id, name), calendar_members!inner(can_edit)')
    .eq('calendar_members.agent_id', agentId)
    .order('type', { ascending: false })
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Visibility is a separate per-agent table (PostgREST can't scope a second
  // nested relation to the same agent_id independently), so merge it in here.
  const { data: visRows } = await db
    .from('calendar_visibility')
    .select('calendar_id, visible')
    .eq('agent_id', agentId)
  const visMap = new Map((visRows ?? []).map(v => [v.calendar_id, v.visible]))

  const result = (data ?? []).map(row => {
    const flat = flattenCalendar(row)
    return { ...flat, visible: visMap.has(row.id) ? !!visMap.get(row.id) : true }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { name, color, group_id, agent_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = agent_id ? await getAgentTenantId(db, agent_id) : null

  const { data, error } = await db
    .from('calendars')
    .insert({
      name: name.trim(), color: color || '#a78bfa', type: 'team', group_id: group_id || null,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, name, color, group_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (color !== undefined) updates.color = color
  if (group_id !== undefined) updates.group_id = group_id

  const db = createServerClient()
  const { data, error } = await db.from('calendars').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const db = createServerClient()
  const { data: cal } = await db.from('calendars').select('type').eq('id', id).single()
  if (cal?.type === 'personal') {
    return NextResponse.json({ error: 'Personal calendars cannot be deleted' }, { status: 400 })
  }

  const { error } = await db.from('calendars').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
