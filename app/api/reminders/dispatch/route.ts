import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendSms } from '@/lib/sms'

// Called every 5 minutes by a Supabase pg_cron job (via pg_net) — see the
// 'dialer-reminder-dispatch' cron job. Not agent-facing; gated by a shared secret
// header since it has to be reachable without a logged-in session.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-reminder-secret')
  if (!secret || secret !== process.env.REMINDER_DISPATCH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const now = Date.now()

  const { data: callbacks, error } = await db
    .from('dialer_callbacks')
    .select('id, lead_phone, lead_name, agent_id, scheduled_at, tenant_id, calendars(reminder_offsets_minutes), agents(did)')
    .eq('status', 'pending')
    .not('calendar_id', 'is', null)
    .gt('scheduled_at', new Date(now).toISOString())
    .lte('scheduled_at', new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let skipped = 0

  for (const cb of callbacks ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offsets: number[] = (cb.calendars as any)?.reminder_offsets_minutes ?? []
    if (!offsets.length) continue

    const minutesUntil = (new Date(cb.scheduled_at).getTime() - now) / 60000
    const dueOffsets = offsets.filter(m => minutesUntil <= m)

    for (const offsetMinutes of dueOffsets) {
      // Claim this (callback, offset) pair first — the unique constraint is what
      // actually prevents a double-send if this job overlaps a previous run.
      const { error: claimError } = await db
        .from('dialer_reminder_log')
        .insert({ callback_id: cb.id, offset_minutes: offsetMinutes })
      if (claimError) { skipped++; continue } // already sent (or a real error) — either way, don't send again

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fromDid = (cb.agents as any)?.did
      if (!fromDid || !cb.lead_phone) continue

      try {
        const when = new Date(cb.scheduled_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        const name = cb.lead_name ? `Hi ${cb.lead_name}, ` : 'Hi, '
        const body = `${name}this is a reminder about your upcoming appointment on ${when}.`
        await sendSms({ from: fromDid, to: cb.lead_phone, body, agentId: cb.agent_id })
        sent++
      } catch (err) {
        // Log row already written above — a broken Telnyx SMS setup fails silently
        // per-callback instead of blocking the rest of the dispatch run or retrying every 5 min.
        console.error(`Reminder SMS failed for callback ${cb.id} (offset ${offsetMinutes}m):`, err)
      }
    }
  }

  return NextResponse.json({ ok: true, sent, skipped })
}
