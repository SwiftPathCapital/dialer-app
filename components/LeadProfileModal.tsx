'use client'

import { useEffect, useState } from 'react'
import { X, Phone, Building2, Tag as TagIcon } from 'lucide-react'
import { Lead, Tag } from '@/lib/types'

const STATUSES = [
  'New', 'Interested', 'Callback', 'App Received', 'Docs Received', 'Pending App & Docs',
  'Deal Funded', 'Not Interested', 'No Answer', 'Left Voicemail', 'Wrong Number', 'DNC',
]

interface Props {
  lead: Lead
  agentId: string
  onClose: () => void
  onSaved: (updated: Lead) => void
  onCall: (phone: string) => void
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
      />
    </div>
  )
}

export default function LeadProfileModal({ lead, agentId, onClose, onSaved, onCall }: Props) {
  const [form, setForm] = useState({
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company_name: lead.company_name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    city: lead.city || '',
    state: lead.state || '',
    status: lead.status || 'New',
    revenue: lead.revenue || '',
    monthly_deposit: lead.monthly_deposit || '',
    requested_amount: lead.requested_amount || '',
    tib: lead.tib || '',
    fico: lead.fico || '',
    employee_size: lead.employee_size || '',
    why_funds: lead.why_funds || '',
  })
  const [saving, setSaving] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tags, setTags] = useState<Tag[]>(lead.tags || [])

  useEffect(() => {
    fetch(`/api/admin/tags?agent_id=${agentId}`)
      .then(r => r.json())
      .then(d => setAllTags(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [agentId])

  function update(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function toggleTag(tag: Tag) {
    const has = tags.some(t => t.id === tag.id)
    setTags(prev => has ? prev.filter(t => t.id !== tag.id) : [...prev, tag])
    if (has) {
      await fetch(`/api/leads/tags?lead_id=${lead.id}&tag_id=${tag.id}`, { method: 'DELETE' }).catch(() => {})
    } else {
      await fetch('/api/leads/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, tag_id: tag.id }),
      }).catch(() => {})
    }
  }

  async function save() {
    setSaving(true)
    // revenue/monthly_deposit/requested_amount are numeric columns — an empty string
    // is invalid input for them, so blank means null, not ''.
    const numericFields = ['revenue', 'monthly_deposit', 'requested_amount'] as const
    const payload: Record<string, string | null> = { ...form }
    for (const key of numericFields) {
      if (payload[key] === '') payload[key] = null
    }
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, ...payload }),
    })
    setSaving(false)
    if (res.ok) onSaved({ ...lead, ...form, tags })
  }

  const displayName = form.company_name || [form.first_name, form.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-gray-900 border-l border-gray-700 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 flex items-center gap-3 z-10">
          <div className="p-2 rounded-full bg-blue-900/40 text-blue-400 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">{displayName}</p>
            <p className="text-gray-500 text-xs truncate">{form.phone || 'No phone'}</p>
          </div>
          {form.phone && (
            <button
              onClick={() => onCall(form.phone)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
            >
              <Phone className="w-3.5 h-3.5" /> Call
            </button>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1">Status / Disposition</label>
            <select
              value={form.status}
              onChange={e => update('status', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <TagIcon className="w-3.5 h-3.5" /> Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(tag => {
                const active = tags.some(t => t.id === tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-opacity"
                    style={{ backgroundColor: tag.color, opacity: active ? 1 : 0.35 }}
                  >
                    {tag.name}
                  </button>
                )
              })}
              {allTags.length === 0 && <p className="text-gray-600 text-xs">No tags created yet</p>}
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" value={form.first_name} onChange={v => update('first_name', v)} />
              <Field label="Last Name" value={form.last_name} onChange={v => update('last_name', v)} />
              <div className="col-span-2">
                <Field label="Company" value={form.company_name} onChange={v => update('company_name', v)} />
              </div>
              <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} />
              <Field label="Email" value={form.email} onChange={v => update('email', v)} type="email" />
              <Field label="City" value={form.city} onChange={v => update('city', v)} />
              <Field label="State" value={form.state} onChange={v => update('state', v)} />
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Business</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Revenue" value={form.revenue} onChange={v => update('revenue', v)} />
              <Field label="Monthly Deposit" value={form.monthly_deposit} onChange={v => update('monthly_deposit', v)} />
              <Field label="Requested Amount" value={form.requested_amount} onChange={v => update('requested_amount', v)} />
              <Field label="Time in Business" value={form.tib} onChange={v => update('tib', v)} />
              <Field label="FICO" value={form.fico} onChange={v => update('fico', v)} />
              <Field label="Employee Size" value={form.employee_size} onChange={v => update('employee_size', v)} />
            </div>
            <div className="mt-3">
              <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1">Why Funds</label>
              <textarea
                value={form.why_funds}
                onChange={e => update('why_funds', e.target.value)}
                rows={3}
                className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-800 px-5 py-3">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
