import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden, switchedAccount, type Caller } from '@/lib/caller'
import { newSigningToken, logContractEvent, requestIp, effectiveStatus, LINK_TTL_DAYS } from '@/lib/contracts'
import { deliverSigningLink } from '@/lib/contractSend'
import { CONTRACT_LIST_COLUMNS, toListRow } from '@/lib/contractRows'

type Params = { params: Promise<{ id: string }> }
type Db = ReturnType<typeof createServerClient>

// The sending agent or an admin of the account.
async function loadOwn(db: Db, caller: Caller, id: string) {
  const { data } = await db.from('dialer_contracts').select(CONTRACT_LIST_COLUMNS).eq('id', id).eq('tenant_id', caller.tenantId).maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Contract not found' }, { status: 404 }) }
  if (!isAdmin(caller) && data.agent_id !== caller.id) return { error: forbidden() }
  return { contract: data }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const { id } = await params
  const db = createServerClient()
  const r = await loadOwn(db, caller, id)
  if ('error' in r) return r.error
  const { data: events } = await db.from('dialer_contract_events')
    .select('event, at, ip, detail').eq('contract_id', id).eq('tenant_id', caller.tenantId).order('at')
  return NextResponse.json({ ...toListRow(r.contract), events: events ?? [] })
}

// { action: 'void' } cancels an unsigned contract; { action: 'resend' } sends a fresh link
// (the old link stops working) and restarts the 30-day clock.
export async function PATCH(req: NextRequest, { params }: Params) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const { id } = await params
  const { action } = await req.json().catch(() => ({}))
  const db = createServerClient()
  const r = await loadOwn(db, caller, id)
  if ('error' in r) return r.error
  const c = r.contract
  const status = effectiveStatus(c)
  const ip = requestIp(req.headers)

  if (action === 'void') {
    if (status === 'signed') return NextResponse.json({ error: 'A signed contract can\'t be voided.' }, { status: 409 })
    if (status === 'voided') return NextResponse.json(toListRow(c))
    const { data } = await db.from('dialer_contracts').update({ status: 'voided', voided_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', caller.tenantId).in('status', ['sent', 'viewed']).select(CONTRACT_LIST_COLUMNS).maybeSingle()
    if (!data) return NextResponse.json({ error: 'It was signed a moment ago — refresh.' }, { status: 409 })
    await logContractEvent(db, { tenant_id: caller.tenantId, contract_id: id, event: 'voided', ip, detail: { by: caller.id } })
    return NextResponse.json(toListRow(data))
  }

  if (action === 'resend') {
    if (caller.actingAs) return switchedAccount()
    if (status === 'signed' || status === 'voided') return NextResponse.json({ error: `A ${status} contract can't be resent.` }, { status: 409 })
    const { token, tokenHash } = newSigningToken()
    const { data } = await db.from('dialer_contracts')
      .update({ token_hash: tokenHash, status: c.viewed_at ? 'viewed' : 'sent', expires_at: new Date(Date.now() + LINK_TTL_DAYS * 86_400_000).toISOString() })
      .eq('id', id).eq('tenant_id', caller.tenantId).in('status', ['sent', 'viewed']).select(CONTRACT_LIST_COLUMNS).maybeSingle()
    if (!data) return NextResponse.json({ error: 'It was signed a moment ago — refresh.' }, { status: 409 })
    const sent = await deliverSigningLink(db, {
      tenantId: caller.tenantId, agentId: c.agent_id ?? caller.id, delivery: c.delivery, token,
      signerName: c.signer_name, signerEmail: c.signer_email, signerPhone: c.signer_phone, templateName: c.template_name,
    })
    await logContractEvent(db, { tenant_id: caller.tenantId, contract_id: id, event: sent.ok ? 'resent' : 'delivery_failed', ip, detail: sent.ok ? { by: caller.id } : { error: sent.error } })
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 })
    return NextResponse.json(toListRow(data))
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
