import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAppUrl, agentSipUri } from '@/lib/telnyx'
import { getDialerSettings } from '@/lib/dialerSettings'

const XML = { 'Content-Type': 'text/xml' }

type Db = ReturnType<typeof createServerClient>

interface GroupRow {
  id: string
  name: string
  tenant_id: string
  voicemail_enabled: boolean
  inbound_group_members?: { agent_id: string }[]
}

interface AgentRow {
  id: string
  sip_username: string
  sip_connection_id: string | null
  status: string
  voicemail_greeting_url: string | null
  tenant_id: string
}

/** Returns true if the greeting URL is in a format Telnyx <Play> can handle (mp3, wav, ogg).
 *  Strips any query-string cache-busters before checking the extension. */
function isPlayableGreeting(url: string | null | undefined): url is string {
  if (!url) return false
  const path = url.split('?')[0].toLowerCase()
  return path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.ogg')
}

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

// Ring every non-offline member of a group; voicemail fallback happens in ./status
// (which looks the group up again from the call row's group_id).
async function dialGroup(db: Db, BASE_URL: string, group: GroupRow, from: string, to: string, callSid: string) {
  await db.from('dialer_calls').insert({
    direction: 'inbound',
    from_number: from,
    to_number: to,
    group_id: group.id,
    tenant_id: group.tenant_id,
    status: 'ringing',
    telnyx_call_control_id: callSid,
    started_at: new Date().toISOString(),
  })

  const agentIds = (group.inbound_group_members || []).map((m: { agent_id: string }) => m.agent_id)

  const { data: agents } = agentIds.length
    ? await db.from('agents').select('sip_username, sip_connection_id, status').in('id', agentIds)
    : { data: [] }

  // Ring any agent who isn't explicitly offline — busy agents may still take waiting calls
  const availableAgents = (agents ?? []).filter(
    (a: { status: string }) => a.status !== 'offline'
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

// Ring one agent; voicemail fallback (their own greeting) happens in ./status via agent_id.
async function dialAgent(db: Db, BASE_URL: string, agent: AgentRow, from: string, to: string, callSid: string) {
  await db.from('dialer_calls').insert({
    direction: 'inbound',
    from_number: from,
    to_number: to,
    agent_id: agent.id,
    tenant_id: agent.tenant_id,
    status: 'ringing',
    telnyx_call_control_id: callSid,
    started_at: new Date().toISOString(),
  })

  // If the agent is offline their SIP client won't be registered — skip the
  // dial and go straight to voicemail so the caller doesn't wait 30 seconds in silence.
  if (agent.status === 'offline') {
    await db.from('dialer_calls')
      .update({ status: 'no-answer', ended_at: new Date().toISOString() })
      .eq('telnyx_call_control_id', callSid)

    const gUrl = agent.voicemail_greeting_url
    const greetingXml = isPlayableGreeting(gUrl)
      ? `<Play>${gUrl}</Play>`
      : `<Say>Please leave a message after the beep.</Say>`
    return texml(`${greetingXml}\n  <Record maxLength="120" recordingStatusCallback="${BASE_URL}/api/webhooks/voice/recording"/>`)
  }

  const sipUri = agentSipUri(agent.sip_username, agent.sip_connection_id)
  return texml(`<Dial timeout="30" action="${BASE_URL}/api/webhooks/voice/status">\n  <Sip>${sipUri}</Sip>\n  </Dial>`)
}

const AGENT_COLUMNS = 'id, sip_username, sip_connection_id, extension, did, status, voicemail_greeting_url, tenant_id, role'

// A lead calling back one of a tenant's local presence numbers: route per the number's
// override, else the tenant default — the agent who last called them, or a group.
async function routeLocalPresenceCallback(
  db: Db, BASE_URL: string,
  local: { tenant_id: string; callback_mode: string | null; callback_group_id: string | null },
  from: string, to: string, callSid: string,
) {
  const settings = await getDialerSettings(db, local.tenant_id)
  const mode = local.callback_mode ?? settings.callback_mode
  const groupId = local.callback_group_id ?? settings.callback_group_id

  const loadGroup = async (id: string | null) => {
    if (!id) return null
    const { data } = await db
      .from('inbound_groups')
      .select('*, inbound_group_members(agent_id)')
      .eq('id', id)
      .eq('tenant_id', local.tenant_id)
      .maybeSingle()
    return data as GroupRow | null
  }

  if (mode === 'last_agent') {
    const fromDigits = from.replace(/\D/g, '').slice(-10)
    if (fromDigits.length === 10) {
      const { data: lastCall } = await db
        .from('dialer_calls')
        .select('agent_id')
        .eq('tenant_id', local.tenant_id)
        .eq('direction', 'outbound')
        .not('agent_id', 'is', null)
        .ilike('to_number', `%${fromDigits}%`)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastCall?.agent_id) {
        const { data: agent } = await db.from('agents').select(AGENT_COLUMNS).eq('id', lastCall.agent_id).eq('tenant_id', local.tenant_id).maybeSingle()
        if (agent?.sip_username) return dialAgent(db, BASE_URL, agent as AgentRow, from, to, callSid)
      }
    }
  }

  const group = await loadGroup(groupId)
  if (group) return dialGroup(db, BASE_URL, group, from, to, callSid)

  // Nothing else configured — the account admin, so a callback is never dropped.
  const { data: admin } = await db
    .from('agents')
    .select(AGENT_COLUMNS)
    .eq('tenant_id', local.tenant_id)
    .eq('role', 'admin')
    .not('sip_username', 'is', null)
    .order('name')
    .limit(1)
    .maybeSingle()
  if (admin) return dialAgent(db, BASE_URL, admin as AgentRow, from, to, callSid)

  return texml(`<Say>Sorry, no one is available to take your call. Please try again later.</Say><Hangup/>`)
}

async function handle(req: NextRequest) {
  const params = await getParams(req)

  const to = params.get('To') || ''
  const from = params.get('From') || ''
  const callSid = params.get('CallSid') || ''

  console.log('[voice webhook] method:', req.method, 'To:', to, 'From:', from, 'CallSid:', callSid)

  const [db, BASE_URL] = [createServerClient(), await getAppUrl()]
  const toDigits = to.replace(/\D/g, '')

  console.log('[voice webhook] toDigits:', toDigits)

// --- 1. Try inbound group match ---
  // Matched by the real dialed number, which is unique per Telnyx account regardless of
  // tenant — but once matched, every downstream record (the call row especially) must be
  // stamped with THAT group's tenant, not left to default to whichever tenant happens to
  // be first. A wrong tenant_id here would misfile the call and hide it from the right client.
  const { data: allGroups } = await db
    .from('inbound_groups')
    .select('*, inbound_group_members(agent_id)')

  const group = allGroups?.find(g => g.phone_number?.replace(/\D/g, '') === toDigits) ?? null

  if (group) return dialGroup(db, BASE_URL, group as GroupRow, from, to, callSid)

  // --- 2. Try direct agent line (extension or did field) ---
  const { data: allAgents } = await db
    .from('agents')
    .select(AGENT_COLUMNS)

  const directAgent = allAgents?.find(a => {
    const extDigits = a.extension?.replace(/\D/g, '')
    const didDigits = a.did?.replace(/\D/g, '')
    return (extDigits && extDigits === toDigits) || (didDigits && didDigits === toDigits)
  }) ?? null

  if (directAgent) return dialAgent(db, BASE_URL, directAgent as AgentRow, from, to, callSid)

  // --- 3. Local presence number (a lead calling back) ---
  // Includes disabled numbers: a lead may call back a number that's since been taken out
  // of outbound rotation, and that callback should still reach someone.
  if (toDigits) {
    const { data: localNumbers } = await db
      .from('dialer_caller_ids')
      .select('tenant_id, phone_number, callback_mode, callback_group_id')
    const local = localNumbers?.find(n => n.phone_number.replace(/\D/g, '') === toDigits) ?? null
    if (local) return routeLocalPresenceCallback(db, BASE_URL, local, from, to, callSid)
  }

  // --- 4. Nothing matched ---
  return texml(`<Say>This number is not configured.</Say><Hangup/>`)
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
