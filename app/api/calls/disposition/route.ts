import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { lead_phone, lead_id, agent_id, disposition, notes } = await req.json()
  const db = createServerClient()

  const digits = lead_phone.replace(/\D/g, '')

  // Find the most recent call involving this number (inbound: from_number, outbound: to_number)
  // Exclude ghost rows (null telnyx_call_control_id)
  const { data: outboundCalls } = await db
    .from('dialer_calls')
    .select('id, duration_seconds, started_at')
    .ilike('to_number', `%${digits}%`)
    .not('telnyx_call_control_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)

  const { data: inboundCalls } = await db
    .from('dialer_calls')
    .select('id, duration_seconds, started_at')
    .ilike('from_number', `%${digits}%`)
    .not('telnyx_call_control_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)

  // Pick whichever is more recent
  const candidates = [...(outboundCalls || []), ...(inboundCalls || [])]
  candidates.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
  const calls = candidates.length ? [candidates[0]] : []

  if (calls?.[0]) {
    await db.from('dialer_calls')
      .update({ disposition, notes: notes || null })
      .eq('id', calls[0].id)

    if (lead_id && agent_id) {
      // Look up agent name for lead_comments
      const { data: agentRow } = await db
        .from('agents')
        .select('name')
        .eq('id', agent_id)
        .single()

      const agentName = agentRow?.name || 'Agent'

      // Build note content — disposition always included, notes appended if present
      const commentContent = notes?.trim()
        ? `[Call · ${disposition}]\n${notes.trim()}`
        : `[Call · ${disposition}]`

      await Promise.all([
        // CRM activities log
        db.from('activities').insert({
          lead_id,
          agent_id,
          type: 'call',
          disposition,
          notes: notes || null,
          duration: calls[0].duration_seconds || null,
        }),
        // CRM notes section
        db.from('lead_comments').insert({
          lead_id,
          agent_id,
          agent_name: agentName,
          content: commentContent,
        }),
      ])
    }
  }

  return NextResponse.json({ ok: true })
}
