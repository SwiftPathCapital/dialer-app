import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Telnyx calls this when the admin's barge call is answered.
// We join the admin's leg to the conference in muted (listen-only) mode.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const event = body?.data?.event_type
  const callControlId: string | undefined = body?.data?.payload?.call_control_id
  const clientStateB64: string | undefined = body?.data?.payload?.client_state

  if (event !== 'call.answered' || !callControlId || !clientStateB64) {
    return NextResponse.json({ ok: true })
  }

  let conferenceId: string
  try {
    const decoded = JSON.parse(Buffer.from(clientStateB64, 'base64').toString())
    conferenceId = decoded.conference_id
  } catch {
    return NextResponse.json({ error: 'Invalid client_state' }, { status: 400 })
  }

  const db = createServerClient()
  const { data } = await db.from('app_config').select('value').eq('key', 'telnyx_api_key').single()
  const apiKey = data?.value
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  // Join admin to conference — muted so they can only listen
  await fetch(`https://api.telnyx.com/v2/conferences/${conferenceId}/actions/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call_control_id: callControlId,
      mute: true,       // admin cannot be heard
      hold: false,
      start_conference_on_create: false,
    }),
  })

  return NextResponse.json({ ok: true })
}
