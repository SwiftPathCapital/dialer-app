'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, Plus, Trash2, Save, Loader2, Eye, Pencil } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Field { key: string; label: string; type: string; required: boolean; prefill: string | null }
interface Template { id?: string; name: string; body: string; fields: Field[]; amount_field: string | null; enabled: boolean }

const FIELD_TYPES = [
  { value: 'text', label: 'Text' }, { value: 'textarea', label: 'Long text' }, { value: 'money', label: 'Dollar amount' },
  { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' },
]
const PREFILL = [
  { value: '', label: 'Agent types it' }, { value: 'name', label: 'Lead: full name' }, { value: 'company_name', label: 'Lead: company' },
  { value: 'email', label: 'Lead: email' }, { value: 'phone', label: 'Lead: phone' }, { value: 'city', label: 'Lead: city' },
  { value: 'state', label: 'Lead: state' }, { value: 'requested_amount', label: 'Lead: requested amount' },
]
const BUILT_IN = [
  { key: 'signer_name', label: 'Signer name' }, { key: 'signer_email', label: 'Signer email' }, { key: 'signer_phone', label: 'Signer phone' },
  { key: 'business_name', label: 'Your business name' }, { key: 'date', label: 'Date sent' },
]
const inputCls = 'bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'
const labelCls = 'text-gray-500 text-[10px] uppercase tracking-widest block mb-1'
const keyFromLabel = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field'
const blank = (): Template => ({ name: '', body: '# Agreement\n\nThis agreement is made on {{date}} between {{business_name}} and {{signer_name}}.\n', fields: [], amount_field: null, enabled: true })

export default function ContractTemplatesAdmin() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [draft, setDraft] = useState<Template | null>(null)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/contract-templates')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setTemplates(d) })
      .catch(err => setMessage({ kind: 'error', text: err.message || 'Could not load templates' }))
  }, [])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
  }, [agent, agentLoading, router, load])

  const usedKeys = useMemo(() => new Set([...(draft?.body ?? '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1])), [draft?.body])

  function patch(p: Partial<Template>) { setDraft(d => d ? { ...d, ...p } : d); setMessage(null) }
  function patchField(i: number, p: Partial<Field>) {
    if (!draft) return
    const fields = draft.fields.map((f, j) => j === i ? { ...f, ...p } : f)
    patch({ fields })
  }
  function addField() {
    if (!draft) return
    let key = 'field', n = 1
    while (draft.fields.some(f => f.key === key)) key = `field_${++n}`
    patch({ fields: [...draft.fields, { key, label: '', type: 'text', required: true, prefill: null }] })
  }
  function removeField(i: number) {
    if (!draft) return
    const removed = draft.fields[i]
    patch({ fields: draft.fields.filter((_, j) => j !== i), amount_field: draft.amount_field === removed.key ? null : draft.amount_field })
  }
  function insert(key: string) {
    if (!draft) return
    const el = document.getElementById('tpl-body') as HTMLTextAreaElement | null
    const at = el?.selectionStart ?? draft.body.length
    const body = `${draft.body.slice(0, at)}{{${key}}}${draft.body.slice(at)}`
    patch({ body })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + key.length + 4, at + key.length + 4) })
  }

  async function save() {
    if (!draft) return
    setSaving(true); setMessage(null)
    const res = await fetch('/api/admin/contract-templates', {
      method: draft.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setSaving(false)
    if (!res?.ok) { setMessage({ kind: 'error', text: d?.error || 'Could not save' }); return }
    setDraft(d)
    setMessage({ kind: 'ok', text: 'Saved. Contracts already sent keep the wording they were sent with.' })
    load()
  }

  async function remove() {
    if (!draft?.id || !confirm(`Delete "${draft.name}"? Contracts already sent with it are kept.`)) return
    await fetch(`/api/admin/contract-templates?id=${draft.id}`, { method: 'DELETE' }).catch(() => {})
    setDraft(null)
    load()
  }

  const previewText = draft ? draft.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const f = draft.fields.find(x => x.key === k) ?? BUILT_IN.find(x => x.key === k)
    return `[${f?.label || k}]`
  }) : ''

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <FileSignature className="w-6 h-6 text-cyan-400" />
        <h1 className="text-white text-2xl font-bold flex-1">Contracts</h1>
        <button onClick={() => { setDraft(blank()); setPreview(false); setMessage(null) }} className="flex items-center gap-1.5 px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg">
          <Plus className="w-4 h-4" /> New template
        </button>
      </div>
      <p className="text-gray-400 text-sm mb-6">Write the contract once with fill-in fields. Agents only fill the fields and send; clients sign on their phone. Have your attorney review the wording.</p>

      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <div className="space-y-1">
          {!templates ? <p className="text-gray-500 text-sm">Loading…</p> : templates.length === 0 ? <p className="text-gray-500 text-sm">No templates yet.</p> : templates.map(t => (
            <button key={t.id} onClick={() => { setDraft(t); setPreview(false); setMessage(null) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${draft?.id === t.id ? 'bg-cyan-500/10 border-cyan-500/40 text-white' : 'border-transparent text-gray-300 hover:bg-white/5'}`}>
              <span className="block truncate">{t.name}</span>
              <span className="text-xs text-gray-500">{t.fields.length} field{t.fields.length === 1 ? '' : 's'}{t.enabled ? '' : ' · off'}</span>
            </button>
          ))}
        </div>

        {!draft ? <div className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl p-8 text-center">Pick a template or create a new one.</div> : (
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className={labelCls} htmlFor="tpl-name">Template name</label>
                <input id="tpl-name" value={draft.name} onChange={e => patch({ name: e.target.value })} className={`${inputCls} w-full`} />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 pb-2">
                <input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })} className="accent-cyan-500" /> Agents can send it
              </label>
            </div>

            <div>
              <p className="text-gray-300 text-sm font-medium mb-2">Fields the agent fills in</p>
              <div className="space-y-2">
                {draft.fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input aria-label="Field label" placeholder="Label (e.g. Monthly fee)" value={f.label} onChange={e => patchField(i, { label: e.target.value, ...(draft.id ? {} : { key: keyFromLabel(e.target.value) }) })} className={`${inputCls} col-span-4`} />
                    <select aria-label="Field type" value={f.type} onChange={e => patchField(i, { type: e.target.value })} className={`${inputCls} col-span-3`}>
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select aria-label="Pre-fill" value={f.prefill ?? ''} onChange={e => patchField(i, { prefill: e.target.value || null })} className={`${inputCls} col-span-3`}>
                      {PREFILL.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <label className="col-span-1 flex items-center gap-1 text-xs text-gray-400" title="Required"><input type="checkbox" checked={f.required} onChange={e => patchField(i, { required: e.target.checked })} className="accent-cyan-500" /> Req.</label>
                    <button onClick={() => removeField(i)} aria-label="Remove field" className="col-span-1 text-gray-500 hover:text-pink-300 justify-self-center"><Trash2 className="w-4 h-4" /></button>
                    <p className="col-span-12 -mt-1 text-[11px] text-gray-500">
                      {'{{'}{f.key}{'}}'} {usedKeys.has(f.key) ? '' : <span className="text-amber-400">— not used in the text yet</span>}
                    </p>
                  </div>
                ))}
              </div>
              <button onClick={addField} className="mt-2 flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"><Plus className="w-3.5 h-3.5" /> Add field</button>
            </div>

            <div>
              <label className={labelCls} htmlFor="tpl-amount">Amount to charge when signed</label>
              <select id="tpl-amount" value={draft.amount_field ?? ''} onChange={e => patch({ amount_field: e.target.value || null })} className={inputCls}>
                <option value="">No charge</option>
                {draft.fields.filter(f => f.type === 'money').map(f => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-1">
                <p className="text-gray-300 text-sm font-medium flex-1">Contract text</p>
                <button onClick={() => setPreview(p => !p)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                  {preview ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><Eye className="w-3.5 h-3.5" /> Preview</>}
                </button>
              </div>
              {!preview && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[...draft.fields.filter(f => f.label), ...BUILT_IN].map(f => (
                    <button key={f.key} onClick={() => insert(f.key)} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-700 text-gray-200 hover:bg-gray-600">+ {f.label}</button>
                  ))}
                </div>
              )}
              {preview
                ? <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{previewText}</div>
                : <textarea id="tpl-body" value={draft.body} onChange={e => patch({ body: e.target.value })} rows={16} className={`${inputCls} w-full font-mono text-[13px] leading-relaxed`} />}
              <p className="text-gray-500 text-[11px] mt-1">Start a line with <code className="text-gray-300"># </code> for a heading. Leave a blank line between paragraphs.</p>
            </div>

            {message && <p className={`text-sm ${message.kind === 'error' ? 'text-pink-300' : 'text-emerald-300'}`}>{message.text}</p>}
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {draft.id ? 'Save changes' : 'Create template'}
              </button>
              {draft.id && <button onClick={remove} className="flex items-center gap-1 text-sm text-gray-500 hover:text-pink-300"><Trash2 className="w-4 h-4" /> Delete</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
