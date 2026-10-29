import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

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
  const all = searchParams.get('all') === 'true'
  const caller = await getCaller()
  if (!caller) return unauthorized()
  // Always the signed-in user — an agent can't list someone else's calendars.
  const agentId = caller.id

  const db = createServerClient()

  if (all) {
    // Admin console view: every calendar in the requesting admin's tenant, with its member list.
    if (!isAdmin(caller)) return forbidden()
    const tenantId = caller.tenantId

    const { data, error } = await db
      .from('calendars')
      .select('id, name, color, type, owner_agent_id, group_id, reminder_offsets_minutes, created_at, calendar_groups(id, name), calendar_members(agent_id, can_edit, agents(id, name))')
      .eq('tenant_id', tenantId)
      .order('type', { ascending: false }) // team calendars first
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // A given agent's own calendars: personal + any team calendar they're a member of.
  const { data, error } = await db
    .from('calendars')
    .select('id, name, color, type, owner_agent_id, group_id, reminder_offsets_minutes, created_at, calendar_groups(id, name), calendar_members!inner(can_edit)')
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
  const { name, color, group_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()

  const db = createServerClient()
  const tenantId = caller.tenantId

  const { data, error } = await db
    .from('calendars')
    .insert({
      name: name.trim(), color: color || '#a78bfa', type: 'team', group_id: group_id || null,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, name, color, group_id, reminder_offsets_minutes } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (color !== undefined) updates.color = color
  if (group_id !== undefined) updates.group_id = group_id
  if (reminder_offsets_minutes !== undefined) updates.reminder_offsets_minutes = reminder_offsets_minutes

  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const db = createServerClient()
  const { data, error } = await db.from('calendars').update(updates).eq('id', id).eq('tenant_id', caller.tenantId).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const db = createServerClient()
  const { data: cal } = await db.from('calendars').select('type').eq('id', id).eq('tenant_id', caller.tenantId).maybeSingle()
  if (!cal) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  if (cal.type === 'personal') {
    return NextResponse.json({ error: 'Personal calendars cannot be deleted' }, { status: 400 })
  }

  const { error } = await db.from('calendars').delete().eq('id', id).eq('tenant_id', caller.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
