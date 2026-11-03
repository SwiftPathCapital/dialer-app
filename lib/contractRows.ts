import { effectiveStatus } from './contracts'

// What an agent may see about a contract: status and who/what — never the contract text,
// the signature, or the signing link.
export const CONTRACT_LIST_COLUMNS = 'id, template_id, template_name, lead_id, agent_id, signer_name, signer_email, signer_phone, delivery, amount_cents, currency, status, sent_at, viewed_at, signed_at, expires_at, voided_at, payment_status, sent_ip, signer_ip, signed_pdf_path, agents(name)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toListRow(c: any) {
  const { sent_ip, signer_ip, signed_pdf_path, agents, ...rest } = c
  return {
    ...rest,
    status: effectiveStatus(c),
    agent_name: agents?.name ?? null,
    has_pdf: !!signed_pdf_path,
    same_network_as_sender: !!(signer_ip && sent_ip && signer_ip === sent_ip),
  }
}
