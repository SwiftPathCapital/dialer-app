import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { call_control_id, admin_sip_username } = await req.json()

  if (!call_control_id) return NextResponse.json({ error: 'No call control ID — only inbound calls can be monitored.' }, { status: 400 })

  const db = createServerClient()

  const [apiKeyRes, connIdRes, groupRes, appUrlRes] = await Promise.all([
    db.from('app_config').select('value').eq('key', 'telnyx_api_key').single(),
    db.from('app_config').select('value').eq('key', 'telnyx_sip_connection_id').single(),
    db.from('inbound_groups').select('phone_number').not('phone_number', 'is', null).limit(1).single(),
    db.from('app_config').select('value').eq('key', 'app_url').single(),
  ])

  const apiKey = apiKeyRes.data?.value
  const connectionId = connIdRes.data?.value
  const fromNumber = groupRes.data?.phone_number
  const appUrl = appUrlRes.data?.value || process.env.NEXT_PUBLIC_APP_URL || ''

  if (!apiKey) return NextResponse.json({ error: 'Telnyx API key not configured in Admin → Config.' }, { status: 500 })
  if (!connectionId) return NextResponse.json({ error: 'SIP Connection ID not configured in Admin → Config.' }, { status: 500 })
  if (!fromNumber) return NextResponse.json({ error: 'No inbound group phone number configured.' }, { status: 500 })

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // Step 1: Create conference — this moves the agent's call leg into it
  const confRes = await fetch('https://api.telnyx.com/v2/conferences', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `monitor-${Date.now()}`,
      call_control_id,
      start_conference_on_create: true,
    }),
  })
  const confData = await confRes.json()
  if (!confRes.ok) {
    return NextResponse.json({ error: confData.errors?.[0]?.detail || 'Could not create conference.' }, { status: 500 })
  }

  const conferenceId = confData.data?.id
  if (!conferenceId) return NextResponse.json({ error: 'No conference ID returned.' }, { status: 500 })

  // Step 2: Dial admin's WebRTC SIP URI — pass conference_id in client_state so the barge-answer webhook can join them
  const clientState = Buffer.from(JSON.stringify({ conference_id: conferenceId })).toString('base64')
  const adminSipUri = `sip:${admin_sip_username}@sip.telnyx.com`

  const dialRes = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to: adminSipUri,
      from: fromNumber,
      connection_id: connectionId,
      webhook_url: `${appUrl}/api/webhooks/voice/barge-answer`,
      client_state: clientState,
    }),
  })
  const dialData = await dialRes.json()
  if (!dialRes.ok) {
    return NextResponse.json({ error: dialData.errors?.[0]?.detail || 'Could not call admin.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, conference_id: conferenceId })
}
