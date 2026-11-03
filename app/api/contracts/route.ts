import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, switchedAccount } from '@/lib/caller'
import { cleanFieldValues, renderBody, sha256, newSigningToken, logContractEvent, requestIp, LINK_TTL_DAYS, type TemplateField } from '@/lib/contracts'
import { deliverSigningLink } from '@/lib/contractSend'
import { isEmailConfigured } from '@/lib/email'
import { CONTRACT_LIST_COLUMNS, toListRow } from '@/lib/contractRows'

export async function GET(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const { searchParams } = new URL(req.url)
  const db = createServerClient()

  let query = db.from('dialer_contracts').select(CONTRACT_LIST_COLUMNS)
    .eq('tenant_id', caller.tenantId)
    .order('sent_at', { ascending: false })
    .limit(200)
  const leadId = searchParams.get('lead_id')
  if (leadId) query = query.eq('lead_id', leadId)
  // Agents see the contracts they sent; admins see the whole account.
  if (!isAdmin(caller)) query = query.eq('agent_id', caller.id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(toListRow))
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  // The link is texted from the sender's own line, so it must be the account's own agent.
  if (caller.actingAs) return switchedAccount()
  const b = await req.json().catch(() => ({}))
  const delivery = b.delivery === 'email' ? 'email' : b.delivery === 'sms' ? 'sms' : null
  if (!delivery) return NextResponse.json({ error: 'Choose text or email.' }, { status: 400 })
  if (delivery === 'email' && !isEmailConfigured()) return NextResponse.json({ error: 'Email isn\'t connected yet. Send by text for now.' }, { status: 409 })
  const db = createServerClient()

  const { data: tpl } = await db.from('dialer_contract_templates')
    .select('id, name, body, fields, amount_field, enabled')
    .eq('id', b.template_id).eq('tenant_id', caller.tenantId).maybeSingle()
  if (!tpl || !tpl.enabled) return NextResponse.json({ error: 'Pick a contract template.' }, { status: 400 })

  let leadId: string | null = null
  if (b.lead_id) {
    const { data: lead } = await db.from('leads').select('id').eq('id', b.lead_id).eq('tenant_id', caller.tenantId).maybeSingle()
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    leadId = lead.id
  }

  // Signer contact details are validated the same way as template fields.
  const signer = cleanFieldValues([
    { key: 'signer_name', label: 'Signer name', type: 'text', required: true },
    { key: 'signer_email', label: 'Signer email', type: 'email', required: delivery === 'email' },
    { key: 'signer_phone', label: 'Signer phone', type: 'phone', required: delivery === 'sms' },
  ], b)
  if ('error' in signer) return NextResponse.json({ error: signer.error }, { status: 400 })
  const fields = (tpl.fields ?? []) as TemplateField[]
  const cleaned = cleanFieldValues(fields, b.values ?? {})
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })

  const { data: tenant } = await db.from('tenants').select('name').eq('id', caller.tenantId).maybeSingle()
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
  const rendered = renderBody(tpl.body, {
    ...cleaned.display,
    signer_name: signer.display.signer_name,
    signer_email: signer.display.signer_email,
    signer_phone: signer.display.signer_phone,
    business_name: tenant?.name ?? '',
    date: today,
  })
  const amountCents = tpl.amount_field ? cleaned.cents[tpl.amount_field] ?? null : null
  const { token, tokenHash } = newSigningToken()
  const ip = requestIp(req.headers)

  const { data: contract, error } = await db.from('dialer_contracts').insert({
    tenant_id: caller.tenantId,
    template_id: tpl.id,
    template_name: tpl.name,
    lead_id: leadId,
    agent_id: caller.id,
    signer_name: signer.values.signer_name,
    signer_email: signer.values.signer_email || null,
    signer_phone: signer.values.signer_phone || null,
    delivery,
    field_values: cleaned.values,
    rendered_body: rendered,
    body_hash: sha256(rendered),
    token_hash: tokenHash,
    amount_cents: amountCents,
    sent_ip: ip,
    expires_at: new Date(Date.now() + LINK_TTL_DAYS * 86_400_000).toISOString(),
  }).select(CONTRACT_LIST_COLUMNS).single()
  if (error || !contract) return NextResponse.json({ error: error?.message || 'Could not create the contract' }, { status: 500 })

  const sent = await deliverSigningLink(db, {
    tenantId: caller.tenantId, agentId: caller.id, delivery, token,
    signerName: contract.signer_name, signerEmail: contract.signer_email, signerPhone: contract.signer_phone, templateName: tpl.name,
  })
  if (!sent.ok) {
    // Nothing reached the signer: void it so the dead link can never be used.
    await db.from('dialer_contracts').update({ status: 'voided', voided_at: new Date().toISOString() }).eq('id', contract.id)
    await logContractEvent(db, { tenant_id: caller.tenantId, contract_id: contract.id, event: 'delivery_failed', ip, detail: { delivery, error: sent.error } })
    return NextResponse.json({ error: sent.error }, { status: 502 })
  }
  await logContractEvent(db, { tenant_id: caller.tenantId, contract_id: contract.id, event: 'sent', ip, user_agent: req.headers.get('user-agent'), detail: { delivery, to: delivery === 'sms' ? contract.signer_phone : contract.signer_email, by: caller.id } })
  return NextResponse.json(toListRow(contract))
}
