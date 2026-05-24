import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.data) return new NextResponse('bad request', { status: 400 })

  const { from, to, text: msgBody, id: telnyxMessageId } = body.data.payload || {}

  if (!from || !to || !msgBody) return new NextResponse('missing fields', { status: 400 })

  const contactNumber = from.phone_number || from
  const ourNumber = to?.[0]?.phone_number || to

  const db = createServerClient()

  const { data: conversation } = await db
    .from('sms_conversations')
    .upsert(
      { contact_number: contactNumber, our_number: ourNumber, last_message_at: new Date().toISOString() },
      { onConflict: 'contact_number,our_number' }
    )
    .select()
    .single()

  if (conversation) {
    await db.from('sms_messages').insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      body: msgBody,
      telnyx_message_id: telnyxMessageId,
      sent_at: new Date().toISOString(),
    })
  }

  return new NextResponse('', { status: 200 })
}
