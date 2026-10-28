import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { runTemplate, rowsToHtmlTable, dueNow, TEMPLATE_IDS, TEMPLATE_LABELS, type TemplateId, type ReportFilters } from '@/lib/reports'

// Called hourly by a Supabase pg_cron job (via pg_net) — see the
// 'dialer-report-dispatch' cron job. Not agent-facing; gated by a shared secret
// header since it has to be reachable without a logged-in session.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-report-secret')
  if (!secret || secret !== process.env.REPORT_DISPATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const now = new Date()

  const { data: schedules, error } = await db
    .from('dialer_report_schedules')
    .select('id, tenant_id, template, filters, recipients, frequency, hour_utc, day_of_week, day_of_month, last_sent_at')
    .eq('enabled', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let failed = 0
  let notDue = 0

  for (const schedule of schedules ?? []) {
    if (!dueNow(schedule, now)) { notDue++; continue }
    const template = schedule.template as TemplateId
    if (!TEMPLATE_IDS.includes(template)) continue

    // Stamp first so an overlapping or slow run can't send the same schedule twice.
    await db.from('dialer_report_schedules').update({ last_sent_at: now.toISOString() }).eq('id', schedule.id)

    try {
      const filters = (schedule.filters as ReportFilters) || {}
      const { columns, rows } = await runTemplate(db, schedule.tenant_id, template, filters)
      const subject = `${TEMPLATE_LABELS[template]} report — ${now.toISOString().slice(0, 10)}`
      const body = `<p>${TEMPLATE_LABELS[template]} · ${rows.length} rows</p>${rowsToHtmlTable(columns, rows)}`
      for (const to of schedule.recipients as string[]) {
        await sendEmail({ to, subject, body })
      }
      sent++
    } catch (err) {
      // Email isn't connected yet (lib/email.ts throws) — fail this schedule quietly
      // so the rest of the run still completes.
      failed++
      console.error(`Report dispatch failed for schedule ${schedule.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, sent, failed, notDue })
}
