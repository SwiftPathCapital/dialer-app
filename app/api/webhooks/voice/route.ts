import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAppUrl, agentSipUri } from '@/lib/telnyx'

const XML = { 'Content-Type': 'text/xml' }

function texml(content: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>`, { headers: XML })
}

async function getParams(req: NextRequest): Promise<URLSearchParams> {
  const contentType = req.headers.get('content-type') || ''
  if (req.method === 'POST' && contentType.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(await req.text())
  }
  return req.nextUrl.searchParams
}

async function handle(req: NextRequest) {
  const params = await getParams(req)

  const to = params.get('To') || ''
  const from = params.get('From') || ''
  const callSid = params.get('CallSid') || ''

  const [db, BASE_URL] = [createServerClient(), await getAppUrl()]

  const { data: group } = await db
    .from('inbound_groups')
    .select('*, inbound_group_members(agent_id)')
    .eq('phone_number', to)
    .single()

  if (!group) {
    return texml(`<Say>This number is not configured.</Say><Hangup/>`)
  }

  // Log the call
  await db.from('dialer_calls').insert({
    direction: 'inbound',
    from_number: from,
    to_number: to,
    group_id: group.id,
    status: 'ringing',
    telnyx_call_control_id: callSid,
    started_at: new Date().toISOString(),
  })

  // Get available agents in this group
  const agentIds = (group.inbound_group_members || []).map((m: { agent_id: string }) => m.agent_id)

  const { data: agents } = agentIds.length
    ? await db.from('agents').select('sip_username, sip_connection_id').in('id', agentIds).eq('status', 'available')
    : { data: [] }

  const voicemailXml = group.voicemail_enabled
    ? `<Say>Please leave a message after the beep.</Say>\n  <Record maxLength="120" recordingStatusCallback="${BASE_URL}/api/webhooks/voice/recording"/>`
    : `<Say>No agents are available. Goodbye.</Say>`

  if (!agents || agents.length === 0) {
    await db.from('dialer_calls').update({ status: 'no-answer', ended_at: new Date().toISOString() }).eq('telnyx_call_control_id', callSid)
    return texml(`<Say>All agents are currently unavailable.</Say>\n  ${voicemailXml}`)
  }

  const sipTargets = agents
    .map((a: { sip_username: string; sip_connection_id: string | null }) => `  <Sip>${agentSipUri(a.sip_username, a.sip_connection_id)}</Sip>`)
    .join('\n')

  return texml(
    `<Dial timeout="20" action="${BASE_URL}/api/webhooks/voice/status">\n${sipTargets}\n  </Dial>`
  )
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
