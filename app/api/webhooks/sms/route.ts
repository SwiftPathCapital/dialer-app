import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.data) return new NextResponse('bad request', { status: 400 })

  const { from, to, text: msgBody, id: telnyxMessageId } = body.data.payload || {}

  if (!from || !to || !msgBody) return new NextResponse('missing fields', { status: 400 })

  const contactNumber = from.phone_number || from
  const ourNumber = to?.[0]?.phone_number || to
  const ourDigits = (ourNumber || '').replace(/\D/g, '')

  const db = createServerClient()

  // Resolve which tenant owns the number this text came in on — same lookup shape as the
  // voice webhook — so the conversation doesn't default to whichever tenant happens to be
  // first. Falls back to the schema default (today's only tenant) if nothing matches.
  let tenantId: string | null = null
  if (ourDigits) {
    const [{ data: ownerGroup }, { data: ownerAgent }] = await Promise.all([
      db.from('inbound_groups').select('tenant_id, phone_number'),
      db.from('agents').select('tenant_id, did'),
    ])
    const group = ownerGroup?.find(g => g.phone_number?.replace(/\D/g, '') === ourDigits)
    const agent = ownerAgent?.find(a => a.did?.replace(/\D/g, '') === ourDigits)
    tenantId = group?.tenant_id ?? agent?.tenant_id ?? null
  }

  const { data: conversation } = await db
    .from('sms_conversations')
    .upsert(
      {
        contact_number: contactNumber, our_number: ourNumber, last_message_at: new Date().toISOString(),
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
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
