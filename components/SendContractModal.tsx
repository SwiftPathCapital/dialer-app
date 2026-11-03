'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Send, Loader2, MessageSquare, Mail } from 'lucide-react'
import type { ContractRow } from '@/components/ContractsPanel'

export interface ContractLead {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone?: string | null
  state?: string | null
  city?: string | null
  requested_amount?: string | null
}

interface TemplateField { key: string; label: string; type: string; required: boolean; prefill?: string | null }
interface TemplateOption { id: string; name: string; fields: TemplateField[]; amount_field: string | null }

const inputCls = 'w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'
const labelCls = 'text-gray-500 text-[10px] uppercase tracking-widest block mb-1'

function leadValue(lead: ContractLead, source: string | null | undefined): string {
  if (!source) return ''
  if (source === 'name') return lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  const v = lead[source as keyof ContractLead]
  return v == null ? '' : String(v)
}

// The agent fills in only the template's fields; the contract text itself is never shown.
export default function SendContractModal({ lead, onClose, onSent }: { lead: ContractLead; onClose: () => void; onSent: (row: ContractRow) => void }) {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  const [emailAvailable, setEmailAvailable] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [signer, setSigner] = useState({
    signer_name: lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(' '),
    signer_phone: lead.phone || '',
    signer_email: lead.email || '',
  })
  const [delivery, setDelivery] = useState<'sms' | 'email'>('sms')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/contracts/templates')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => {
        setTemplates(d.templates)
        setEmailAvailable(!!d.email_available)
        if (d.templates.length === 1) setTemplateId(d.templates[0].id)
      })
      .catch(err => setError(err.message || 'Could not load contract templates'))
  }, [])

  const template = useMemo(() => templates?.find(t => t.id === templateId) ?? null, [templates, templateId])

  // Pre-fill from the lead when a template is picked — only then, so it never wipes what
  // the agent has typed (callers may pass a new lead object on every render).
  const leadRef = useRef(lead)
  leadRef.current = lead
  useEffect(() => {
    if (!template) return
    setValues(Object.fromEntries(template.fields.map(f => [f.key, leadValue(leadRef.current, f.prefill)])))
  }, [template])

  async function send() {
    if (!template) { setError('Pick a contract.'); return }
    setSending(true); setError('')
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: template.id, lead_id: lead.id, delivery, values, ...signer }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setSending(false)
    if (!res?.ok) { setError(d?.error || 'Could not send the contract'); return }
    onSent(d)
  }

  const inputFor = (f: TemplateField) => {
    const common = { value: values[f.key] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues(v => ({ ...v, [f.key]: e.target.value })), className: inputCls, id: `cf-${f.key}` }
    if (f.type === 'textarea') return <textarea rows={3} {...common} className={`${inputCls} resize-none`} />
    if (f.type === 'date') return <input type="date" {...common} />
    if (f.type === 'money') return <input inputMode="decimal" placeholder="$0.00" {...common} />
    if (f.type === 'number') return <input inputMode="decimal" {...common} />
    if (f.type === 'email') return <input type="email" {...common} />
    if (f.type === 'phone') return <input type="tel" {...common} />
    return <input type="text" {...common} />
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Send contract" className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center gap-3">
          <p className="text-white font-semibold flex-1">Send contract</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {!templates ? <p className="text-gray-500 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
            : templates.length === 0 ? <p className="text-gray-400 text-sm">No contract templates yet. An admin can add them under Admin → Contracts.</p>
            : <>
              <div>
                <label className={labelCls} htmlFor="cf-template">Contract</label>
                <select id="cf-template" value={templateId} onChange={e => setTemplateId(e.target.value)} className={inputCls}>
                  <option value="">Choose…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {template && <>
                <div className="space-y-3">
                  {template.fields.map(f => (
                    <div key={f.key}>
                      <label className={labelCls} htmlFor={`cf-${f.key}`}>{f.label}{f.required ? ' *' : ''}</label>
                      {inputFor(f)}
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-800 pt-4 space-y-3">
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Signer</p>
                  <div>
                    <label className={labelCls} htmlFor="cf-signer-name">Full name *</label>
                    <input id="cf-signer-name" value={signer.signer_name} onChange={e => setSigner(s => ({ ...s, signer_name: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls} htmlFor="cf-signer-phone">Mobile{delivery === 'sms' ? ' *' : ''}</label>
                      <input id="cf-signer-phone" type="tel" value={signer.signer_phone} onChange={e => setSigner(s => ({ ...s, signer_phone: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="cf-signer-email">Email{delivery === 'email' ? ' *' : ''}</label>
                      <input id="cf-signer-email" type="email" value={signer.signer_email} onChange={e => setSigner(s => ({ ...s, signer_email: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDelivery('sms')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm border ${delivery === 'sms' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                      <MessageSquare className="w-4 h-4" /> Text
                    </button>
                    <button type="button" onClick={() => emailAvailable && setDelivery('email')} disabled={!emailAvailable} title={emailAvailable ? '' : 'Email isn\'t connected yet'} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm border ${delivery === 'email' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200' : 'border-gray-700 text-gray-400 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                      <Mail className="w-4 h-4" /> Email{emailAvailable ? '' : ' (not connected)'}
                    </button>
                  </div>
                </div>
              </>}
            </>}
          {error && <p className="text-pink-300 text-sm">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-800 px-5 py-3">
          <button onClick={send} disabled={sending || !template} className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2">
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send for signature</>}
          </button>
        </div>
      </div>
    </div>
  )
}
