import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, agentInTenant, unauthorized, forbidden, type Caller } from '@/lib/caller'

type Db = ReturnType<typeof createServerClient>

// Non-admins may change their own events, or events on a calendar they can edit.
async function canModify(db: Db, caller: Caller, id: string): Promise<'ok' | 'missing' | 'denied'> {
  const { data: ev } = await db.from('dialer_callbacks').select('agent_id, calendar_id').eq('id', id).eq('tenant_id', caller.tenantId).maybeSingle()
  if (!ev) return 'missing'
  if (isAdmin(caller) || ev.agent_id === caller.id) return 'ok'
  if (ev.calendar_id) {
    const { data: m } = await db.from('calendar_members').select('can_edit').eq('calendar_id', ev.calendar_id).eq('agent_id', caller.id).maybeSingle()
    if (m?.can_edit) return 'ok'
  }
  return 'denied'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all') === 'true'
  const status = searchParams.get('status') || 'pending'
  const calendarIdsParam = searchParams.get('calendar_ids')
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const admin = isAdmin(caller)
  // Admins may look at a teammate's events; everyone else only sees their own.
  const agentId = admin ? searchParams.get('agent_id') : caller.id

  const db = createServerClient()

  let query = db
    .from('dialer_callbacks')
    .select('*, agents(id, name)')
    .eq('tenant_id', caller.tenantId)
    .order('scheduled_at', { ascending: true })

  if (status !== 'all') query = query.eq('status', status)
  if (calendarIdsParam) {
    let ids = calendarIdsParam.split(',').filter(Boolean)
    if (!admin) {
      const { data: mine } = await db.from('calendar_members').select('calendar_id').eq('agent_id', caller.id).in('calendar_id', ids)
      ids = (mine ?? []).map(m => m.calendar_id)
    }
    query = query.in('calendar_id', ids.length ? ids : [crypto.randomUUID()])
  } else if (all) {
    // Admin "all agents" view of the tenant, optionally narrowed to one agent.
    if (!admin) return forbidden()
    if (agentId) query = query.eq('agent_id', agentId)
  } else {
    query = query.eq('agent_id', agentId || caller.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { lead_id, lead_phone, lead_name, scheduled_at, notes, dialer_call_id, event_type, calendar_id } = body
  const type = event_type || 'callback'
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const tenantId = caller.tenantId

  // Events are scheduled for yourself; admins may schedule for a teammate.
  let agent_id: string = caller.id
  if (body.agent_id && body.agent_id !== caller.id) {
    if (!isAdmin(caller) || !(await agentInTenant(db, body.agent_id, tenantId))) return forbidden()
    agent_id = body.agent_id
  }

  // Tasks aren't necessarily tied to a phone number; every other event type needs one.
  if ((!lead_phone && type !== 'task') || !scheduled_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let targetCalendarId: string | null = calendar_id || null
  if (targetCalendarId) {
    const { data: membership } = await db
      .from('calendar_members')
      .select('can_edit')
      .eq('calendar_id', targetCalendarId)
      .eq('agent_id', agent_id)
      .single()
    if (!membership?.can_edit) {
      return NextResponse.json({ error: 'You do not have permission to schedule on this calendar' }, { status: 403 })
    }
  } else {
    const { data: personalCal } = await db
      .from('calendars')
      .select('id')
      .eq('owner_agent_id', agent_id)
      .eq('type', 'personal')
      .single()
    targetCalendarId = personalCal?.id ?? null
  }

  const { data, error } = await db
    .from('dialer_callbacks')
    .insert({
      lead_id: lead_id || null,
      lead_phone: lead_phone || null,
      lead_name: lead_name || null,
      agent_id,
      scheduled_at,
      notes: notes || null,
      dialer_call_id: dialer_call_id || null,
      event_type: type,
      calendar_id: targetCalendarId,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, notes, scheduled_at } = body

  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })
  const caller = await getCaller()
  if (!caller) return unauthorized()

  const db = createServerClient()
  const access = await canModify(db, caller, id)
  if (access === 'missing') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (access === 'denied') return forbidden()
  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  if (notes !== undefined) updates.notes = notes
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at

  const { data, error } = await db
    .from('dialer_callbacks')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', caller.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const access = await canModify(db, caller, id)
  if (access === 'missing') return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (access === 'denied') return forbidden()
  const { error } = await db.from('dialer_callbacks').delete().eq('id', id).eq('tenant_id', caller.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
