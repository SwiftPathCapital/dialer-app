'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileSignature, Send, RotateCw, Ban, CreditCard, Download, Loader2, AlertTriangle } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import SendContractModal, { type ContractLead } from '@/components/SendContractModal'

export interface ContractRow {
  id: string
  template_name: string
  signer_name: string
  signer_phone: string | null
  signer_email: string | null
  delivery: 'sms' | 'email'
  amount_cents: number | null
  currency: string
  status: 'sent' | 'viewed' | 'signed' | 'voided' | 'expired'
  sent_at: string
  viewed_at: string | null
  signed_at: string | null
  payment_status: string
  agent_name: string | null
  has_pdf: boolean
  same_network_as_sender: boolean
}

const STATUS: Record<ContractRow['status'], { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  viewed: { label: 'Opened', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  signed: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  voided: { label: 'Voided', cls: 'bg-gray-700/40 text-gray-400 border-gray-600' },
  expired: { label: 'Expired', cls: 'bg-gray-700/40 text-gray-400 border-gray-600' },
}

const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// True when the Contracts feature is visible for this agent (hidden per account/agent like any page).
export function useContractsEnabled(): boolean {
  const { agent } = useSoftphone()
  const hidden = [...(agent?.hidden_features ?? []), ...(agent?.tenant_hidden_features ?? [])]
  return !!agent && !hidden.includes('/contracts')
}

// Contract list with live status. With a lead, shows that lead's contracts and a Send button.
export default function ContractsPanel({ lead, compact }: { lead?: ContractLead; compact?: boolean }) {
  const { agent } = useSoftphone()
  const isAdmin = agent?.role === 'admin' || !!agent?.is_platform_admin
  const [rows, setRows] = useState<ContractRow[] | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Keyed on the id: callers may pass a fresh lead object every render.
  const leadId = lead?.id
  const load = useCallback(() => {
    fetch(`/api/contracts${leadId ? `?lead_id=${leadId}` : ''}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setRows(d) })
      .catch(err => setError(err.message || 'Could not load contracts'))
  }, [leadId])

  useEffect(() => { load() }, [load])
  // Refresh while anything is waiting on the signer, so Sent → Opened → Completed shows up on its own.
  const waiting = rows?.some(r => r.status === 'sent' || r.status === 'viewed')
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [waiting, load])

  async function act(row: ContractRow, action: 'void' | 'resend') {
    if (action === 'void' && !confirm(`Void "${row.template_name}" for ${row.signer_name}? The signing link will stop working.`)) return
    setBusy(row.id); setError('')
    const res = await fetch(`/api/contracts/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setBusy(null)
    if (!res?.ok) { setError(d?.error || 'Something went wrong'); return }
    setRows(prev => prev?.map(r => r.id === row.id ? d : r) ?? null)
  }

  async function openPdf(row: ContractRow) {
    const res = await fetch(`/api/contracts/${row.id}/pdf`).catch(() => null)
    const d = await res?.json().catch(() => null)
    if (!res?.ok || !d?.url) { setError(d?.error || 'Could not open the signed copy'); return }
    window.open(d.url, '_blank', 'noopener')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5 flex-1">
          <FileSignature className="w-3.5 h-3.5" /> Contracts
        </p>
        {lead && (
          <button onClick={() => setSending(true)} className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium rounded-md transition-colors">
            <Send className="w-3.5 h-3.5" /> Send contract
          </button>
        )}
      </div>
      {error && <p className="text-pink-300 text-xs mb-2">{error}</p>}
      {!rows ? <p className="text-gray-600 text-xs flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
        : rows.length === 0 ? <p className="text-gray-600 text-xs">{lead ? 'No contracts sent to this lead yet.' : 'No contracts sent yet. Open a lead and use Send contract.'}</p>
        : (
          <div className="space-y-2">
            {rows.map(r => {
              const s = STATUS[r.status]
              const open = r.status === 'sent' || r.status === 'viewed'
              return (
                <div key={r.id} className="bg-gray-800/70 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{r.template_name}</p>
                      <p className="text-gray-500 text-xs truncate">
                        {r.signer_name} · {r.delivery === 'sms' ? 'text' : 'email'} · sent {when(r.sent_at)}
                        {!compact && r.agent_name ? ` by ${r.agent_name}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
                  </div>
                  {r.amount_cents != null && <p className="text-gray-300 text-xs mt-1.5">Amount: {money(r.amount_cents, r.currency)}</p>}
                  {r.status === 'signed' && r.signed_at && <p className="text-emerald-300/80 text-xs mt-1">Signed {when(r.signed_at)}</p>}
                  {r.same_network_as_sender && (
                    <p className="text-amber-300 text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Signed from the same network it was sent from</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {open && <>
                      <button onClick={() => act(r, 'resend')} disabled={busy === r.id} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white disabled:opacity-40"><RotateCw className="w-3.5 h-3.5" /> Resend</button>
                      <button onClick={() => act(r, 'void')} disabled={busy === r.id} className="flex items-center gap-1 text-xs text-gray-400 hover:text-pink-300 disabled:opacity-40"><Ban className="w-3.5 h-3.5" /> Void</button>
                    </>}
                    {r.status === 'signed' && isAdmin && r.has_pdf && (
                      <button onClick={() => openPdf(r)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"><Download className="w-3.5 h-3.5" /> Signed PDF</button>
                    )}
                    {r.status === 'signed' && r.amount_cents != null && (
                      <button
                        disabled
                        title="Connect a payment processor to charge from here."
                        className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-gray-700 text-gray-400 text-xs font-medium rounded-md cursor-not-allowed"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Submit &amp; charge {money(r.amount_cents, r.currency)}
                      </button>
                    )}
                  </div>
                  {r.status === 'signed' && r.amount_cents != null && (
                    <p className="text-gray-600 text-[11px] mt-1.5 text-right">Payments aren&apos;t connected yet.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      {sending && lead && (
        <SendContractModal lead={lead} onClose={() => setSending(false)} onSent={row => { setSending(false); setRows(prev => [row, ...(prev ?? [])]) }} />
      )}
    </div>
  )
}
