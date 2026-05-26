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
  const toDigits = to.replace(/\D/g, '')

  // --- 1. Try inbound group match ---
  const { data: allGroups } = await db
    .from('inbound_groups')
    .select('*, inbound_group_members(agent_id)')

  const group = allGroups?.find(g => g.phone_number?.replace(/\D/g, '') === toDigits) ?? null

  if (group) {
    await db.from('dialer_calls').insert({
      direction: 'inbound',
      from_number: from,
      to_number: to,
      group_id: group.id,
      status: 'ringing',
      telnyx_call_control_id: callSid,
      started_at: new Date().toISOString(),
    })

    const agentIds = (group.inbound_group_members || []).map((m: { agent_id: string }) => m.agent_id)

    const { data: agents } = agentIds.length
      ? await db.from('agents').select('sip_username, sip_connection_id, status').in('id', agentIds)
      : { data: [] }

    // Only ring agents who are available — offline/busy agents won't have a registered SIP client
    const availableAgents = (agents ?? []).filter(
      (a: { status: string }) => a.status === 'available'
    )

    const voicemailXml = group.voicemail_enabled
      ? `<Say>Please leave a message after the beep.</Say>\n  <Record maxLength="120" recordingStatusCallback="${BASE_URL}/api/webhooks/voice/recording"/>`
      : `<Say>No agents are available. Goodbye.</Say>`

    if (availableAgents.length === 0) {
      await db.from('dialer_calls').update({ status: 'no-answer', ended_at: new Date().toISOString() }).eq('telnyx_call_control_id', callSid)
      return texml(voicemailXml)
    }

    const sipTargets = availableAgents
      .map((a: { sip_username: string; sip_connection_id: string | null }) => `  <Sip>${agentSipUri(a.sip_username, a.sip_connection_id)}</Sip>`)
      .join('\n')

    return texml(`<Dial callerName="GROUP:${group.name}" timeout="30" action="${BASE_URL}/api/webhooks/voice/status">\n${sipTargets}\n  </Dial>`)
  }

  // --- 2. Try direct agent line (extension or did field) ---
  const { data: allAgents } = await db
    .from('agents')
    .select('id, sip_username, sip_connection_id, extension, did')

  const directAgent = allAgents?.find(a => {
    const extDigits = a.extension?.replace(/\D/g, '')
    const didDigits = a.did?.replace(/\D/g, '')
    return (extDigits && extDigits === toDigits) || (didDigits && didDigits === toDigits)
  }) ?? null

  if (directAgent) {
    await db.from('dialer_calls').insert({
      direction: 'inbound',
      from_number: from,
      to_number: to,
      agent_id: directAgent.id,
      status: 'ringing',
      telnyx_call_control_id: callSid,
      started_at: new Date().toISOString(),
    })

    const sipUri = agentSipUri(directAgent.sip_username, directAgent.sip_connection_id)
    return texml(`<Dial timeout="20" action="${BASE_URL}/api/webhooks/voice/status">\n  <Sip>${sipUri}</Sip>\n  </Dial>`)
  }

  // --- 3. Nothing matched ---
  return texml(`<Say>This number is not configured.</Say><Hangup/>`)
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
