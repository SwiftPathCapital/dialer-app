import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAppUrl } from '@/lib/telnyx'

const XML = { 'Content-Type': 'text/xml' }

function texml(content: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>`, { headers: XML })
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const params = new URLSearchParams(text)

  const callSid = params.get('CallSid') || ''
  const dialStatus = params.get('DialCallStatus') || ''
  const duration = params.get('DialCallDuration')

  const db = createServerClient()

  const { data: call } = await db
    .from('dialer_calls')
    .update({
      status: dialStatus,
      duration_seconds: duration ? parseInt(duration) : null,
      ended_at: new Date().toISOString(),
    })
    .eq('telnyx_call_control_id', callSid)
    .select('group_id')
    .single()

  if (dialStatus !== 'completed' && call?.group_id) {
    const [{ data: group }, { data: members }, BASE_URL] = await Promise.all([
      db.from('inbound_groups').select('voicemail_enabled').eq('id', call.group_id).single(),
      db.from('inbound_group_members').select('agent_id').eq('group_id', call.group_id),
      getAppUrl(),
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
        if (agentsWithGreeting?.[0]?.voicemail_greeting_url) {
          greetingXml = `<Play>${agentsWithGreeting[0].voicemail_greeting_url}</Play>`
        }
      }

      return texml(`${greetingXml}\n  <Record maxLength="120" recordingStatusCallback="${BASE_URL}/api/webhooks/voice/recording"/>`)
    }
    return texml(`<Say>No agents are available. Goodbye.</Say>`)
  }

  return new NextResponse('', { status: 200 })
}
