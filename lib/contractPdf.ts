import type { createServerClient } from './supabase'
import { buildSignedPdf, decodeSignaturePng, sha256, logContractEvent, consentText } from './contracts'

type Db = ReturnType<typeof createServerClient>

// Builds and stores the signed PDF for a signed contract if it isn't stored yet. Safe to
// call again (e.g. if generation failed at signing time). Returns the storage path.
export async function ensureSignedPdf(db: Db, contractId: string): Promise<string | null> {
  const { data: c } = await db.from('dialer_contracts')
    .select('id, tenant_id, template_name, rendered_body, body_hash, signer_name, signer_email, signer_phone, signature_name, signature_image, signed_at, signer_ip, sent_ip, consent_text, signed_pdf_path, status, agents(name)')
    .eq('id', contractId).maybeSingle()
  if (!c || c.status !== 'signed') return null
  if (c.signed_pdf_path) return c.signed_pdf_path

  const png = decodeSignaturePng(c.signature_image)
  if (!png || !c.signed_at || !c.signature_name) return null
  const [{ data: tenant }, { data: events }] = await Promise.all([
    db.from('tenants').select('name').eq('id', c.tenant_id).maybeSingle(),
    db.from('dialer_contract_events').select('event, at, ip, user_agent').eq('contract_id', c.id).order('at'),
  ])
  const businessName = tenant?.name || ''
  const bytes = await buildSignedPdf({
    contractId: c.id,
    templateName: c.template_name,
    businessName,
    renderedBody: c.rendered_body,
    bodyHash: c.body_hash,
    signerName: c.signer_name,
    signerEmail: c.signer_email,
    signerPhone: c.signer_phone,
    senderName: (c.agents as unknown as { name: string } | null)?.name ?? null,
    signatureName: c.signature_name,
    signaturePng: png,
    signedAt: c.signed_at,
    signerIp: c.signer_ip,
    consent: c.consent_text || consentText(businessName),
    sameNetworkAsSender: !!(c.signer_ip && c.sent_ip && c.signer_ip === c.sent_ip),
    events: (events ?? []).map(e => ({ event: e.event, at: e.at, ip: e.ip, user_agent: e.user_agent })),
  })

  const path = `${c.tenant_id}/${c.id}.pdf`
  const { error } = await db.storage.from('contracts').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) { console.error('[contracts] PDF upload failed', c.id, error); return null }
  await db.from('dialer_contracts').update({ signed_pdf_path: path, signed_pdf_hash: sha256(bytes) }).eq('id', c.id)
  await logContractEvent(db, { tenant_id: c.tenant_id, contract_id: c.id, event: 'pdf_generated', detail: { sha256: sha256(bytes) } })
  return path
}
