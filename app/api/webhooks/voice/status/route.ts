import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAppUrl } from '@/lib/telnyx'

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

  const callSid = params.get('CallSid') || ''
  const dialStatus = params.get('DialCallStatus') || ''
  const duration = params.get('DialCallDuration')
  console.log('[voice/status] CallSid:', callSid, 'DialCallStatus:', dialStatus, 'Duration:', duration)

  const db = createServerClient()

  const { data: call } = await db
    .from('dialer_calls')
    .update({
      status: dialStatus,
      duration_seconds: duration ? parseInt(duration) : null,
      ended_at: new Date().toISOString(),
    })
    .eq('telnyx_call_control_id', callSid)
    .select('group_id, agent_id')
    .single()

  if (dialStatus !== 'completed') {
    const BASE_URL = await getAppUrl()

    // --- Group voicemail ---
    if (call?.group_id) {
      const [{ data: group }, { data: members }] = await Promise.all([
        db.from('inbound_groups').select('voicemail_enabled').eq('id', call.group_id).single(),
        db.from('inbound_group_members').select('agent_id').eq('group_id', call.group_id),
      ])

      if (group?.voicemail_enabled) {
        let greetingXml = `<Say>Please leave a message after the beep.</Say>`
        if (members?.length) {
          const agentIds = members.map((m: { agent_id: string }) => m.agent_id)
          const { data: agentsWithGreeting } = await db
            .from('agents')
            .select('voicemail_greeting_url')
            .in('id', agentIds)
            .not('voicemail_greeting_url', 'is', null)
            .limit(1)
          const gUrl = agentsWithGreeting?.[0]?.voicemail_greeting_url
          if (gUrl && !gUrl.endsWith('.webm')) {
            greetingXml = `<Play>${gUrl}</Play>`
          }
        }
        return texml(`${greetingXml}\n  <Record maxLength="120" recordingStatusCallback="${BASE_URL}/api/webhooks/voice/recording"/>`)
      }
      return texml(`<Say>No agents are available. Goodbye.</Say>`)
    }

    // --- Direct agent line voicemail ---
    if (call?.agent_id) {
      const { data: agent } = await db
        .from('agents')
        .select('voicemail_greeting_url')
        .eq('id', call.agent_id)
        .single()

      const url = agent?.voicemail_greeting_url
      const greetingXml = url && !url.endsWith('.webm')
        ? `<Play>${url}</Play>`
        : `<Say>Please leave a message after the beep.</Say>`

      return texml(`${greetingXml}\n  <Record maxLength="120" recordingStatusCallback="${BASE_URL}/api/webhooks/voice/recording"/>`)
    }
  }

  return texml(`<Hangup/>`)
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
