import { createServerClient, getAgentTenantId } from './supabase'
import { getTelnyxClient } from './telnyx'
import { getDialerSettings } from './dialerSettings'
import { chooseCallerId, loadCallerIds } from './localPresence'

interface SendSmsParams {
  from: string
  to: string
  body: string
  agentId?: string | null
  conversationId?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendSms({ from: requestedFrom, to, body, agentId, conversationId }: SendSmsParams): Promise<any> {
  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  // Local-number texting add-on: a brand-new thread starts from the lead's local presence
  // number (if one is SMS-enabled). Existing threads keep whatever number they're on so the
  // contact never sees the conversation jump numbers.
  let from = requestedFrom
  if (!conversationId && tenantId && (await getDialerSettings(db, tenantId)).local_presence_sms_enabled) {
    const digits = to.replace(/\D/g, '').slice(-10)
    const { data: lead } = digits.length === 10
      ? await db.from('leads').select('state').eq('tenant_id', tenantId).ilike('phone', `%${digits}%`).limit(1).maybeSingle()
      : { data: null }
    const picked = chooseCallerId(await loadCallerIds(db, tenantId), to, lead?.state ?? null, { requireSms: true })
    if (picked.number) from = picked.number
  }

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
