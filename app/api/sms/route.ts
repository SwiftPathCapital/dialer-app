import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getTelnyxClient } from '@/lib/telnyx'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversation_id')

  const db = createServerClient()

  if (conversationId) {
    const { data, error } = await db
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await db
    .from('sms_conversations')
    .select('*')
    .order('last_message_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { conversation_id, from, to, body } = await req.json()

  const db = createServerClient()

  // Send via Telnyx
  const telnyx = await getTelnyxClient()
  const result = await (telnyx.messages as any).create({ from, to, text: body })
  const telnyxId = result?.data?.id || null

  // Save to DB
  const { data, error } = await db
    .from('sms_messages')
    .insert({
      conversation_id,
      direction: 'outbound',
      body,
      telnyx_message_id: telnyxId,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single()

  // Update conversation timestamp
  await db
    .from('sms_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
