import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'
import { TEMPLATE_IDS, type TemplateId } from '@/lib/reports'

const FREQUENCIES = ['daily', 'weekly', 'monthly']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The signed-in admin's tenant (proxy.ts already restricts /api/admin/* to admins).
async function adminTenant(): Promise<{ id: string; tenantId: string } | NextResponse> {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  return { id: caller.id, tenantId: caller.tenantId }
}

function validateTiming(frequency: unknown, hourUtc: unknown, dayOfWeek: unknown, dayOfMonth: unknown): string | null {
  if (typeof frequency !== 'string' || !FREQUENCIES.includes(frequency)) return 'frequency must be daily, weekly, or monthly'
  if (!Number.isInteger(hourUtc) || (hourUtc as number) < 0 || (hourUtc as number) > 23) return 'hour_utc must be 0–23'
  if (frequency === 'weekly' && (!Number.isInteger(dayOfWeek) || (dayOfWeek as number) < 0 || (dayOfWeek as number) > 6)) return 'day_of_week must be 0–6 for weekly schedules'
  if (frequency === 'monthly' && (!Number.isInteger(dayOfMonth) || (dayOfMonth as number) < 1 || (dayOfMonth as number) > 28)) return 'day_of_month must be 1–28 for monthly schedules'
  return null
}

function cleanRecipients(recipients: unknown): string[] | null {
  if (!Array.isArray(recipients)) return null
  const list = recipients.map(r => String(r).trim()).filter(Boolean)
  if (list.length === 0 || list.some(r => !EMAIL_RE.test(r))) return null
  return list
}

export async function GET() {
  const admin = await adminTenant()
  if (admin instanceof NextResponse) return admin
  const tenantId = admin.tenantId
  const db = createServerClient()

  const { data, error } = await db
    .from('dialer_report_schedules')
    .select('id, template, filters, recipients, frequency, hour_utc, day_of_week, day_of_month, last_sent_at, enabled, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { template, filters, recipients, frequency, hour_utc, day_of_week, day_of_month } = await req.json()
  if (!TEMPLATE_IDS.includes(template as TemplateId)) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  const list = cleanRecipients(recipients)
  if (!list) return NextResponse.json({ error: 'Enter at least one valid email address' }, { status: 400 })
  const timingError = validateTiming(frequency, hour_utc, day_of_week, day_of_month)
  if (timingError) return NextResponse.json({ error: timingError }, { status: 400 })

  const admin = await adminTenant()
  if (admin instanceof NextResponse) return admin
  const tenantId = admin.tenantId
  const db = createServerClient()

  const { data, error } = await db
    .from('dialer_report_schedules')
    .insert({
      tenant_id: tenantId,
      template,
      filters: {
        range: typeof filters?.range === 'string' ? filters.range : 'today',
        ...(filters?.filter_agent_id ? { filter_agent_id: String(filters.filter_agent_id) } : {}),
      },
      recipients: list,
      frequency,
      hour_utc,
      day_of_week: frequency === 'weekly' ? day_of_week : null,
      day_of_month: frequency === 'monthly' ? day_of_month : null,
      created_by: admin.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, enabled } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })

  const admin = await adminTenant()
  if (admin instanceof NextResponse) return admin
  const tenantId = admin.tenantId
  const db = createServerClient()

  const { data, error } = await db
    .from('dialer_report_schedules')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const admin = await adminTenant()
  if (admin instanceof NextResponse) return admin
  const tenantId = admin.tenantId
  const db = createServerClient()

  const { error } = await db.from('dialer_report_schedules').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
