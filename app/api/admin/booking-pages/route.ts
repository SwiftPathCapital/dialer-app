import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isValidTimeZone, slugify, validateWeeklyHours } from '@/lib/booking'
import { PAGE_COLUMNS } from '@/lib/bookingData'

type Db = ReturnType<typeof createServerClient>

async function requireAdmin(db: Db, agentId: string | null | undefined) {
  if (!agentId) return null
  const { data } = await db.from('agents').select('id, tenant_id, role, is_platform_admin').eq('id', agentId).maybeSingle()
  if (!data || (data.role !== 'admin' && !data.is_platform_admin)) return null
  return data as { id: string; tenant_id: string }
}

// Every calendar in the admin's account, with its booking page if it has one.
export async function GET(req: NextRequest) {
  const db = createServerClient()
  const admin = await requireAdmin(db, new URL(req.url).searchParams.get('agent_id'))
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const [{ data: tenant }, { data: calendars }, { data: pages }] = await Promise.all([
    db.from('tenants').select('slug, name').eq('id', admin.tenant_id).single(),
    db.from('calendars').select('id, name, color, type, calendar_members(agents(name))').eq('tenant_id', admin.tenant_id).order('type', { ascending: false }).order('name'),
    db.from('dialer_booking_pages').select(PAGE_COLUMNS).eq('tenant_id', admin.tenant_id),
  ])
  return NextResponse.json({
    tenant,
    calendars: (calendars ?? []).map(c => ({
      id: c.id, name: c.name, color: c.color, type: c.type,
      members: (c.calendar_members ?? []).map(m => (m.agents as unknown as { name: string } | null)?.name).filter(Boolean),
      page: (pages ?? []).find(p => p.calendar_id === c.id) ?? null,
    })),
  })
}

const EVENT_TYPES = ['meeting', 'discovery', 'in_person', 'callback']

function intIn(v: unknown, lo: number, hi: number) {
  return Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
}

// Create or update the booking page for one calendar.
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const admin = await requireAdmin(db, body.agent_id)
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const { data: cal } = await db.from('calendars').select('id, name').eq('id', body.calendar_id).eq('tenant_id', admin.tenant_id).maybeSingle()
  if (!cal) return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })

  const { data: existing } = await db.from('dialer_booking_pages').select('id').eq('calendar_id', cal.id).maybeSingle()

  // On create, fill link name and title from the calendar; on update, change only what was sent.
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (!existing || body.slug !== undefined) row.slug = slugify(String(body.slug || cal.name))
  if (!existing || body.title !== undefined) row.title = (String(body.title || '').trim() || cal.name).slice(0, 120)
  if (body.description !== undefined) {
    row.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 1000) : null
  }
  if (body.event_type !== undefined) {
    if (!EVENT_TYPES.includes(body.event_type)) return NextResponse.json({ error: 'Unknown meeting type' }, { status: 400 })
    row.event_type = body.event_type
  }
  if (body.duration_minutes !== undefined) {
    if (!intIn(body.duration_minutes, 5, 240)) return NextResponse.json({ error: 'Meeting length must be 5–240 minutes' }, { status: 400 })
    row.duration_minutes = body.duration_minutes
  }
  if (body.buffer_minutes !== undefined) {
    if (!intIn(body.buffer_minutes, 0, 120)) return NextResponse.json({ error: 'Buffer must be 0–120 minutes' }, { status: 400 })
    row.buffer_minutes = body.buffer_minutes
  }
  if (body.min_notice_minutes !== undefined) {
    if (!intIn(body.min_notice_minutes, 0, 20160)) return NextResponse.json({ error: 'Minimum notice must be 0–14 days' }, { status: 400 })
    row.min_notice_minutes = body.min_notice_minutes
  }
  if (body.max_days_ahead !== undefined) {
    if (!intIn(body.max_days_ahead, 1, 180)) return NextResponse.json({ error: 'Booking window must be 1–180 days' }, { status: 400 })
    row.max_days_ahead = body.max_days_ahead
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !isValidTimeZone(body.timezone)) return NextResponse.json({ error: 'Unknown time zone' }, { status: 400 })
    row.timezone = body.timezone
  }
  if (body.weekly_hours !== undefined) {
    const err = validateWeeklyHours(body.weekly_hours)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    row.weekly_hours = body.weekly_hours
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })
    row.enabled = body.enabled
  }

  const { data, error } = existing
    ? await db.from('dialer_booking_pages').update(row).eq('id', existing.id).select(PAGE_COLUMNS).single()
    : await db.from('dialer_booking_pages').insert({ ...row, tenant_id: admin.tenant_id, calendar_id: cal.id }).select(PAGE_COLUMNS).single()
  if (error) {
    const msg = error.code === '23505' ? 'That link name is already used by another page in your account' : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const db = createServerClient()
  const admin = await requireAdmin(db, searchParams.get('agent_id'))
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await db.from('dialer_booking_pages').delete().eq('id', id).eq('tenant_id', admin.tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
