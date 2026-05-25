import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Telnyx calls this when the admin's barge call is answered.
// We create the conference here (safe — live call untouched until admin picks up),
// then join the admin in muted (listen-only) mode.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const event = body?.data?.event_type
  const adminCallControlId: string | undefined = body?.data?.payload?.call_control_id
  const clientStateB64: string | undefined = body?.data?.payload?.client_state

  if (event !== 'call.answered' || !adminCallControlId || !clientStateB64) {
    return NextResponse.json({ ok: true })
  }

  let liveCallControlId: string
  try {
    const decoded = JSON.parse(Buffer.from(clientStateB64, 'base64').toString())
    liveCallControlId = decoded.call_control_id
  } catch {
    return NextResponse.json({ error: 'Invalid client_state' }, { status: 400 })
  }

  const db = createServerClient()
  const { data } = await db.from('app_config').select('value').eq('key', 'telnyx_api_key').single()
  const apiKey = data?.value
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

  // Step 1: Create conference using the live call leg — moves it into the conference
  const confRes = await fetch('https://api.telnyx.com/v2/conferences', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `monitor-${Date.now()}`,
      call_control_id: liveCallControlId,
      start_conference_on_create: true,
    }),
  })
  const confData = await confRes.json()
  if (!confRes.ok) return NextResponse.json({ ok: true }) // live call unaffected if this fails

  const conferenceId = confData.data?.id
  if (!conferenceId) return NextResponse.json({ ok: true })

  // Step 2: Join admin to conference in muted (listen-only) mode
  await fetch(`https://api.telnyx.com/v2/conferences/${conferenceId}/actions/join`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      call_control_id: adminCallControlId,
      mute: true,
      hold: false,
      start_conference_on_create: false,
    }),
  })

  return NextResponse.json({ ok: true })
}
