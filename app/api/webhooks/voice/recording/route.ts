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
    .select('id, group_id, tenant_id')
    .eq('telnyx_call_control_id', callSid)
    .single()

  if (recordingUrl) {
    // voicemails has no agent_id column — a direct-line voicemail's agent is looked up via
    // call_id -> dialer_calls.agent_id (see /api/admin/recordings), same as everywhere else.
    const { error } = await db.from('voicemails').insert({
      call_id: call?.id ?? null,
      group_id: call?.group_id ?? null,
      from_number: from,
      recording_url: recordingUrl,
      listened: false,
      ...(call?.tenant_id ? { tenant_id: call.tenant_id } : {}),
    })
    if (error) console.error('[voice/recording] failed to save voicemail:', error.message)
  }

  return new NextResponse('', { status: 200 })
}
