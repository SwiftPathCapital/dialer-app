import type { createServerClient } from './supabase'
import { DEFAULT_EVENT_MINUTES, type BookingRules, type Interval, type WeeklyHours } from './booking'

type Db = ReturnType<typeof createServerClient>

export interface BookingPage extends BookingRules {
  id: string
  tenant_id: string
  calendar_id: string
  slug: string
  title: string
  description: string | null
  event_type: string
  enabled: boolean
}

export const PAGE_COLUMNS = 'id, tenant_id, calendar_id, slug, title, description, event_type, duration_minutes, buffer_minutes, min_notice_minutes, max_days_ahead, timezone, weekly_hours, enabled'

export async function loadPublicPage(db: Db, tenantSlug: string, pageSlug: string) {
  const { data: tenant } = await db.from('tenants').select('id, name').eq('slug', tenantSlug).maybeSingle()
  if (!tenant) return null
  const { data: page } = await db
    .from('dialer_booking_pages')
    .select(PAGE_COLUMNS)
    .eq('tenant_id', tenant.id)
    .eq('slug', pageSlug)
    .eq('enabled', true)
    .maybeSingle()
  if (!page) return null
  return { tenant, page: { ...page, weekly_hours: page.weekly_hours as WeeklyHours } as BookingPage }
}

// Everyone who must be free: the calendar's owner (personal) or every member (team).
export async function calendarAttendees(db: Db, calendarId: string) {
  const { data: cal } = await db.from('calendars').select('id, type, owner_agent_id').eq('id', calendarId).maybeSingle()
  if (!cal) return { calendar: null, attendees: [] as { id: string; name: string }[] }
  const { data: members } = await db.from('calendar_members').select('agent_id, agents(id, name)').eq('calendar_id', calendarId)
  const people = (members ?? [])
    .map(m => m.agents as unknown as { id: string; name: string } | null)
    .filter((a): a is { id: string; name: string } => !!a)
  const attendees = cal.type === 'personal' && cal.owner_agent_id
    ? people.filter(p => p.id === cal.owner_agent_id)
    : people
  return { calendar: cal, attendees }
}

// Busy time for a set of people: every pending event on any calendar they belong to, plus
// any of their pending events not filed on a calendar. Events without a length count as 30 min.
export async function busyIntervals(db: Db, attendeeIds: string[], fromMs: number, toMs: number): Promise<Interval[]> {
  if (!attendeeIds.length) return []
  const { data: memberships } = await db.from('calendar_members').select('calendar_id').in('agent_id', attendeeIds)
  const calendarIds = [...new Set((memberships ?? []).map(m => m.calendar_id))]
  const lookback = new Date(fromMs - 8 * 60 * 60_000).toISOString() // catch long events starting before the window
  const until = new Date(toMs).toISOString()

  const filters = [`agent_id.in.(${attendeeIds.join(',')})`]
  if (calendarIds.length) filters.push(`calendar_id.in.(${calendarIds.join(',')})`)

  const rows: { scheduled_at: string; duration_minutes: number | null }[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await db
      .from('dialer_callbacks')
      .select('scheduled_at, duration_minutes')
      .eq('status', 'pending')
      .gte('scheduled_at', lookback)
      .lt('scheduled_at', until)
      .or(filters.join(','))
      .order('scheduled_at')
      .range(from, from + 999)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows.map(r => {
    const start = Date.parse(r.scheduled_at)
    return { start, end: start + (r.duration_minutes ?? DEFAULT_EVENT_MINUTES) * 60_000 }
  })
}
