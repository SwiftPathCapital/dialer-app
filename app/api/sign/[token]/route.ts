import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sha256, consentText, CONSENT_VERSION, decodeSignaturePng, logContractEvent, requestIp, effectiveStatus, formatMoney } from '@/lib/contracts'
import { ensureSignedPdf } from '@/lib/contractPdf'

// PUBLIC — the signer's side. The URL token is the only credential: it's 192 random bits,
// stored only as a SHA-256 hash, replaced on resend, and dead once voided or expired.

type Params = { params: Promise<{ token: string }> }

const recentByIp = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (recentByIp.get(ip) ?? []).filter(t => now - t < 10 * 60_000)
  hits.push(now)
  recentByIp.set(ip, hits)
  if (recentByIp.size > 5000) recentByIp.clear()
  return hits.length > 20
}

async function load(token: string) {
  const db = createServerClient()
  const { data: c } = await db.from('dialer_contracts')
    .select('id, tenant_id, template_name, signer_name, rendered_body, body_hash, status, expires_at, amount_cents, currency, viewed_at, signed_at, signature_name, signed_pdf_path')
    .eq('token_hash', sha256(token)).maybeSingle()
  if (!c) return { db, c: null, business: '' }
  const { data: tenant } = await db.from('tenants').select('name').eq('id', c.tenant_id).maybeSingle()
  return { db, c, business: tenant?.name ?? '' }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params
  const { db, c, business } = await load(token)
  if (!c) return NextResponse.json({ error: 'This signing link isn\'t valid. Ask the sender for a new one.' }, { status: 404 })
  const status = effectiveStatus(c)
  const base = { status, business_name: business, template_name: c.template_name, signer_name: c.signer_name }
  if (status === 'voided' || status === 'expired') return NextResponse.json(base, { headers: { 'Cache-Control': 'no-store' } })

  if (status === 'sent' || status === 'viewed') {
    const ip = requestIp(req.headers)
    if (!c.viewed_at) await db.from('dialer_contracts').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'sent')
    await logContractEvent(db, { tenant_id: c.tenant_id, contract_id: c.id, event: 'viewed', ip, user_agent: req.headers.get('user-agent') })
  }
  return NextResponse.json({
    ...base,
    body: c.rendered_body,
    consent_text: consentText(business),
    amount: c.amount_cents != null ? formatMoney(c.amount_cents, c.currency) : null,
    signed_at: c.signed_at,
    signature_name: c.signature_name,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const ip = requestIp(req.headers) || 'unknown'
  if (rateLimited(ip)) return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes.' }, { status: 429 })
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { db, c, business } = await load(token)
  if (!c) return NextResponse.json({ error: 'This signing link isn\'t valid.' }, { status: 404 })
  const status = effectiveStatus(c)
  if (status === 'signed') return NextResponse.json({ error: 'This document is already signed.' }, { status: 409 })
  if (status !== 'sent' && status !== 'viewed') return NextResponse.json({ error: `This document can no longer be signed (${status}).` }, { status: 409 })

  if (b.consent !== true) return NextResponse.json({ error: 'Please agree to sign electronically.' }, { status: 400 })
  const signatureName = String(b.signature_name ?? '').trim().slice(0, 120)
  if (signatureName.length < 2) return NextResponse.json({ error: 'Type your full name.' }, { status: 400 })
  const png = decodeSignaturePng(b.signature_image)
  if (!png) return NextResponse.json({ error: 'Draw your signature in the box.' }, { status: 400 })
  // The text must be exactly what was sent — never sign a document that changed.
  if (sha256(c.rendered_body) !== c.body_hash) {
    console.error('[contracts] body hash mismatch', c.id)
    return NextResponse.json({ error: 'This document failed an integrity check and can\'t be signed. Ask the sender for a new link.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const ua = req.headers.get('user-agent')
  const consent = consentText(business)
  const { data: signed } = await db.from('dialer_contracts').update({
    status: 'signed',
    signed_at: now,
    consent_at: now,
    consent_text: `[${CONSENT_VERSION}] ${consent}`,
    signature_name: signatureName,
    signature_image: b.signature_image,
    signer_ip: ip,
    signer_user_agent: ua,
  }).eq('id', c.id).in('status', ['sent', 'viewed']).gt('expires_at', now).select('id').maybeSingle()
  if (!signed) return NextResponse.json({ error: 'This document can no longer be signed.' }, { status: 409 })

  await logContractEvent(db, { tenant_id: c.tenant_id, contract_id: c.id, event: 'consented', ip, user_agent: ua, detail: { version: CONSENT_VERSION } })
  await logContractEvent(db, { tenant_id: c.tenant_id, contract_id: c.id, event: 'signed', ip, user_agent: ua, detail: { signature_name: signatureName, body_sha256: c.body_hash } })
  const path = await ensureSignedPdf(db, c.id).catch(err => { console.error('[contracts] PDF failed', c.id, err); return null })
  return NextResponse.json({ ok: true, signed_at: now, pdf: !!path })
}
