import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { call_control_id, admin_sip_username } = await req.json()

  if (!call_control_id) return NextResponse.json({ error: 'No call control ID — only inbound calls can be monitored.' }, { status: 400 })

  const db = createServerClient()

  // Look up the target call first so the dial-from number is scoped to its own tenant —
  // otherwise this would always grab whichever inbound group's number happens to sort
  // first, which is wrong once a second tenant with its own numbers exists.
  const { data: callRow } = await db
    .from('dialer_calls')
    .select('agent_call_leg_id, tenant_id')
    .eq('telnyx_call_control_id', call_control_id)
    .maybeSingle()
  const agentCallLegId = callRow?.agent_call_leg_id || null
  const callTenantId = callRow?.tenant_id || null

  let groupQuery = db.from('inbound_groups').select('phone_number').not('phone_number', 'is', null).limit(1)
  if (callTenantId) groupQuery = groupQuery.eq('tenant_id', callTenantId)

  const [apiKeyRes, connIdRes, groupRes, appUrlRes] = await Promise.all([
    db.from('app_config').select('value').eq('key', 'telnyx_api_key').single(),
    db.from('app_config').select('value').eq('key', 'telnyx_sip_connection_id').single(),
    groupQuery.maybeSingle(),
    db.from('app_config').select('value').eq('key', 'app_url').single(),
  ])

  const apiKey = apiKeyRes.data?.value
  const connectionId = connIdRes.data?.value
  const fromNumber = groupRes.data?.phone_number
  const appUrl = appUrlRes.data?.value || process.env.NEXT_PUBLIC_APP_URL || ''

  if (!apiKey) return NextResponse.json({ error: 'Telnyx API key not configured in Admin → Config.' }, { status: 500 })
  if (!connectionId) return NextResponse.json({ error: 'Call Control App ID not configured in Admin → Config.' }, { status: 500 })
  if (!fromNumber) return NextResponse.json({ error: 'No inbound group phone number configured.' }, { status: 500 })

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // Step 1: Validate the connection_id by doing a dry-run dial FIRST.
  // We dial admin before touching the live call so a failure here is safe.
  const clientState = Buffer.from(JSON.stringify({ call_control_id, agent_call_leg_id: agentCallLegId })).toString('base64')
  const adminSipUri = `sip:${admin_sip_username}@sip.telnyx.com`

  const dialPayload = {
    to: adminSipUri,
    from: fromNumber,
    connection_id: connectionId,
    webhook_url: `${appUrl}/api/webhooks/voice/barge-answer`,
    client_state: clientState,
  }
  console.log('[barge] dialing admin:', JSON.stringify(dialPayload))

  const dialRes = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers,
    body: JSON.stringify(dialPayload),
  })
  const dialData = await dialRes.json()
  console.log('[barge] telnyx response:', dialRes.status, JSON.stringify(dialData))

  if (!dialRes.ok) {
    return NextResponse.json({ error: dialData.errors?.[0]?.detail || 'Could not call admin.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
