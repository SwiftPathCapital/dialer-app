import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

async function handle(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const event = body?.data?.event_type

  if (event !== 'call.recording.saved') return NextResponse.json({ ok: true })

  const payload = body?.data?.payload
  const callControlId: string = payload?.call_control_id || ''
  const recordingUrls: Record<string, string> = payload?.recording_urls || {}
  const recordingUrl = recordingUrls?.mp3 || recordingUrls?.wav || ''

  if (!callControlId || !recordingUrl) return NextResponse.json({ ok: true })

  const db = createServerClient()

  // Inbound: matched by agent_call_leg_id; outbound: matched by telnyx_call_control_id
  const { data: byLegId } = await db
    .from('dialer_calls')
    .update({ recording_url: recordingUrl })
    .eq('agent_call_leg_id', callControlId)
    .select('id')
    .limit(1)

  if (!byLegId?.length) {
    await db
      .from('dialer_calls')
      .update({ recording_url: recordingUrl })
      .eq('telnyx_call_control_id', callControlId)
  }

  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) { return handle(req) }
