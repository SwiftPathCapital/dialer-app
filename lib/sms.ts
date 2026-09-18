import { createServerClient, getAgentTenantId } from './supabase'
import { getTelnyxClient } from './telnyx'

interface SendSmsParams {
  from: string
  to: string
  body: string
  agentId?: string | null
  conversationId?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendSms({ from, to, body, agentId, conversationId }: SendSmsParams): Promise<any> {
  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  // Send via Telnyx first — don't create a conversation record for a message that never went out
  const telnyx = await getTelnyxClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (telnyx.messages as any).create({ from, to, text: body })
  const telnyxId = result?.data?.id || null

  // No conversationId means this is the first message to a contact who's never texted in —
  // find-or-create the conversation (same upsert key the inbound webhook uses).
  let convoId = conversationId
  if (!convoId) {
    const { data: convo, error: convoError } = await db
      .from('sms_conversations')
      .upsert(
        { contact_number: to, our_number: from, last_message_at: new Date().toISOString(), ...(tenantId ? { tenant_id: tenantId } : {}) },
        { onConflict: 'contact_number,our_number' }
      )
      .select()
      .single()
    if (convoError || !convo) throw new Error(convoError?.message || 'Could not start conversation')
    convoId = convo.id
  }

  // Save to DB
  const { data, error } = await db
    .from('sms_messages')
    .insert({
      conversation_id: convoId,
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
    .eq('id', convoId)

  if (error) throw new Error(error.message)
  return { ...data, conversation_id: convoId }
}
