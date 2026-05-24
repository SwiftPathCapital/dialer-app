import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const text = await req.text()
  const params = new URLSearchParams(text)

  const callSid = params.get('CallSid') || ''
  const recordingUrl = params.get('RecordingUrl') || ''
  const from = params.get('From') || ''

  const db = createServerClient()

  const { data: call } = await db
    .from('dialer_calls')
    .select('id, group_id, agent_id')
    .eq('telnyx_call_control_id', callSid)
    .single()

  if (recordingUrl) {
    await db.from('voicemails').insert({
      call_id: call?.id ?? null,
      group_id: call?.group_id ?? null,
      agent_id: call?.agent_id ?? null,
      from_number: from,
      recording_url: recordingUrl,
      listened: false,
    })
  }

  return new NextResponse('', { status: 200 })
}
