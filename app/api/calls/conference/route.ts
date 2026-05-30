import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// POST /api/calls/conference
// Merges the active call (newly added party) and the held call into a Telnyx conference.
//
// activeCallLegId — WebRTC call.id for the newly dialed party (the "add party" outbound call)
// heldCallLegId  — WebRTC call.id for the original held call (the agent's SIP leg)
//
// For inbound held calls, we also have telnyx_call_control_id (external caller's leg) and
// agent_call_leg_id in the DB. The conference is anchored on the external caller's leg so
// all three parties (external caller, agent, new party) share the same bridge.
export async function POST(req: NextRequest) {
  const { activeCallLegId, heldCallLegId } = await req.json()
  if (!activeCallLegId || !heldCallLegId) {
    return NextResponse.json({ error: 'Missing call leg IDs' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: apiKeyRow } = await db.from('app_config').select('value').eq('key', 'telnyx_api_key').single()
  const apiKey = apiKeyRow?.value
  if (!apiKey) return NextResponse.json({ error: 'Telnyx API key not configured' }, { status: 500 })

  // Look up the held call — try agent_call_leg_id first (inbound calls), then telnyx_call_control_id (outbound)
  let heldCallRecord: { telnyx_call_control_id: string; agent_call_leg_id: string | null; direction: string } | null = null

  const { data: byLeg } = await db
    .from('dialer_calls')
    .select('telnyx_call_control_id, agent_call_leg_id, direction')
    .eq('agent_call_leg_id', heldCallLegId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byLeg) {
    heldCallRecord = byLeg
  } else {
    const { data: byControl } = await db
      .from('dialer_calls')
      .select('telnyx_call_control_id, agent_call_leg_id, direction')
      .eq('telnyx_call_control_id', heldCallLegId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    heldCallRecord = byControl
  }

  console.log('[conference] heldCallLegId:', heldCallLegId, '→ record:', heldCallRecord)
  console.log('[conference] activeCallLegId:', activeCallLegId)

  if (!heldCallRecord) {
    return NextResponse.json({ error: 'Held call record not found in DB' }, { status: 404 })
  }

  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

  // For inbound calls, anchor the conference on the external caller's leg so all audio paths merge cleanly.
  // For outbound calls, anchor on the call_control_id (which is the agent's outbound session).
  const anchorId = heldCallRecord.direction === 'inbound'
    ? heldCallRecord.telnyx_call_control_id
    : heldCallLegId

  console.log('[conference] creating conference anchored on:', anchorId, '(direction:', heldCallRecord.direction, ')')

  const confRes = await fetch('https://api.telnyx.com/v2/conferences', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `conf-${Date.now()}`,
      call_control_id: anchorId,
      start_conference_on_create: true,
    }),
  })
  const confData = await confRes.json()
  if (!confRes.ok) {
    const detail = confData.errors?.[0]?.detail || confData.errors?.[0]?.title || JSON.stringify(confData)
    console.error('[conference] create failed (anchor:', anchorId, '):', detail)
    return NextResponse.json({ error: detail }, { status: 500 })
  }

  const conferenceId = confData.data?.id
  if (!conferenceId) return NextResponse.json({ error: 'No conference ID returned' }, { status: 500 })

  console.log('[conference] created:', conferenceId)

  const joinLegs: string[] = []

  // For inbound held calls, explicitly join the agent's original SIP leg into the conference
  if (heldCallRecord.direction === 'inbound' && heldCallRecord.agent_call_leg_id) {
    joinLegs.push(heldCallRecord.agent_call_leg_id)
  }

  // Join the newly added party's call leg
  joinLegs.push(activeCallLegId)

  const joinResults = await Promise.all(
    joinLegs.map(async (legId) => {
      const res = await fetch(`https://api.telnyx.com/v2/conferences/${conferenceId}/actions/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ call_control_id: legId }),
      })
      const body = await res.json()
      if (!res.ok) {
        console.error('[conference] join failed for leg', legId, ':', body)
      } else {
        console.log('[conference] join queued for leg', legId)
      }
      return { legId, ok: res.ok, body }
    })
  )

  const failedJoin = joinResults.find(r => !r.ok)
  if (failedJoin) {
    const detail = failedJoin.body?.errors?.[0]?.detail || failedJoin.body?.errors?.[0]?.title || JSON.stringify(failedJoin.body)
    return NextResponse.json({ error: `Join failed for leg ${failedJoin.legId}: ${detail}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, conferenceId })
}
