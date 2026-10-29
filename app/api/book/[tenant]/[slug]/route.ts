import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generateSlots, limitSlotsPerDay } from '@/lib/booking'
import { loadPublicPage, calendarAttendees, busyIntervals } from '@/lib/bookingData'

// PUBLIC (no login) — what anyone with the booking link can see and do. Exposes only the
// page's title/description, host first names, and open start times; never event details.

const DAY_MS = 24 * 60 * 60_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Basic abuse guard for a single Railway instance: at most 5 bookings per IP per hour.
const recentByIp = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (recentByIp.get(ip) ?? []).filter(t => now - t < 60 * 60_000)
  if (hits.length >= 5) { recentByIp.set(ip, hits); return true }
  hits.push(now)
  recentByIp.set(ip, hits)
  if (recentByIp.size > 5000) recentByIp.clear()
  return false
}

type Params = { params: Promise<{ tenant: string; slug: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { tenant: tenantSlug, slug } = await params
  const db = createServerClient()
  const found = await loadPublicPage(db, tenantSlug, slug)
  if (!found) return NextResponse.json({ error: 'This booking page doesn\'t exist or is turned off.' }, { status: 404 })
  const { tenant, page } = found

  const { attendees } = await calendarAttendees(db, page.calendar_id)
  const now = Date.now()
  const busy = await busyIntervals(db, attendees.map(a => a.id), now, now + (page.max_days_ahead + 2) * DAY_MS)
  const slots = attendees.length ? limitSlotsPerDay(generateSlots(page, busy, now), page.max_slots_per_day, page.timezone, page.id) : []

  return NextResponse.json({
    page: {
      title: page.title,
      description: page.description,
      duration_minutes: page.duration_minutes,
      timezone: page.timezone,
      business: tenant.name,
      hosts: attendees.map(a => a.name.split(' ')[0]),
    },
    slots: slots.map(s => new Date(s).toISOString()),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { tenant: tenantSlug, slug } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  // Honeypot: real visitors never see or fill this field.
  if (body.website) return NextResponse.json({ ok: true })

  const name = String(body.name ?? '').trim().slice(0, 120)
  const email = String(body.email ?? '').trim().slice(0, 200)
  const phoneDigits = String(body.phone ?? '').replace(/\D/g, '')
  const notes = String(body.notes ?? '').trim().slice(0, 2000)
  const startMs = Date.parse(String(body.start ?? ''))
  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 })
  const ten = phoneDigits.length === 11 && phoneDigits.startsWith('1') ? phoneDigits.slice(1) : phoneDigits
  if (ten.length !== 10) return NextResponse.json({ error: 'Please enter a 10-digit US phone number.' }, { status: 400 })
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: 'Please pick a time.' }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) return NextResponse.json({ error: 'Too many bookings from this connection. Please try again later.' }, { status: 429 })

  const db = createServerClient()
  const found = await loadPublicPage(db, tenantSlug, slug)
  if (!found) return NextResponse.json({ error: 'This booking page doesn\'t exist or is turned off.' }, { status: 404 })
  const { page } = found
  const { calendar, attendees } = await calendarAttendees(db, page.calendar_id)
  if (!calendar || !attendees.length) return NextResponse.json({ error: 'This calendar has no hosts yet.' }, { status: 409 })

  const now = Date.now()
  const attendeeIds = attendees.map(a => a.id)
  const busy = await busyIntervals(db, attendeeIds, now, now + (page.max_days_ahead + 2) * DAY_MS)
  if (!limitSlotsPerDay(generateSlots(page, busy, now), page.max_slots_per_day, page.timezone, page.id).includes(startMs)) {
    return NextResponse.json({ error: 'That time was just taken. Please pick another.' }, { status: 409 })
  }

  const phone = `+1${ten}`
  const { data: existingLead } = await db
    .from('leads')
    .select('id')
    .eq('tenant_id', page.tenant_id)
    .ilike('phone', `%${ten}%`)
    .limit(1)
    .maybeSingle()
  let leadId = existingLead?.id ?? null
  if (!leadId) {
    const [first, ...rest] = name.split(/\s+/)
    const { data: lead } = await db
      .from('leads')
      .insert({
        tenant_id: page.tenant_id, name, first_name: first, last_name: rest.join(' ') || null,
        phone, email, status: 'New', lead_type: 'Booking Page', lead_type_label: page.title,
      })
      .select('id')
      .single()
    leadId = lead?.id ?? null
  }

  const startIso = new Date(startMs).toISOString()
  const { data: event, error } = await db
    .from('dialer_callbacks')
    .insert({
      tenant_id: page.tenant_id,
      calendar_id: page.calendar_id,
      agent_id: calendar.type === 'personal' ? calendar.owner_agent_id : null,
      lead_id: leadId,
      lead_name: name,
      lead_phone: phone,
      scheduled_at: startIso,
      duration_minutes: page.duration_minutes,
      event_type: page.event_type,
      status: 'pending',
      notes: [`Booked online via "${page.title}"`, `Email: ${email}`, notes && `Notes: ${notes}`].filter(Boolean).join('\n'),
    })
    .select('id')
    .single()
  if (error || !event) return NextResponse.json({ error: 'Could not save your booking. Please try again.' }, { status: 500 })

  // Two people can submit the same slot in the same instant; the earliest saved row wins.
  const { data: clash } = await db
    .from('dialer_callbacks')
    .select('id, created_at')
    .eq('calendar_id', page.calendar_id)
    .eq('scheduled_at', startIso)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (clash && clash.length > 1 && clash[0].id !== event.id) {
    await db.from('dialer_callbacks').delete().eq('id', event.id)
    return NextResponse.json({ error: 'That time was just taken. Please pick another.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, start: startIso, duration_minutes: page.duration_minutes })
}
