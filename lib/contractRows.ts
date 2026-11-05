import { effectiveStatus } from './contracts'

// What an agent may see about a contract: status and who/what — never the contract text,
// the signature, or the signing link.
export const CONTRACT_LIST_COLUMNS = 'id, template_id, template_name, lead_id, agent_id, signer_name, signer_email, signer_phone, delivery, amount_cents, currency, status, sent_at, viewed_at, signed_at, expires_at, voided_at, payment_status, sent_ip, signer_ip, signed_pdf_path, agents(name)'

// Picks fields explicitly so nothing else on the row (text, signature, link hash) can leak.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toListRow(c: any) {
  return {
    id: c.id,
    template_id: c.template_id,
    template_name: c.template_name,
    lead_id: c.lead_id,
    agent_id: c.agent_id,
    signer_name: c.signer_name,
    signer_email: c.signer_email,
    signer_phone: c.signer_phone,
    delivery: c.delivery,
    amount_cents: c.amount_cents,
    currency: c.currency,
    status: effectiveStatus(c),
    sent_at: c.sent_at,
    viewed_at: c.viewed_at,
    signed_at: c.signed_at,
    expires_at: c.expires_at,
    voided_at: c.voided_at,
    payment_status: c.payment_status,
    agent_name: c.agents?.name ?? null,
    has_pdf: !!c.signed_pdf_path,
    same_network_as_sender: !!(c.signer_ip && c.sent_ip && c.signer_ip === c.sent_ip),
  }
}
