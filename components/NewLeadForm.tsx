'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Lead } from '@/lib/types'

interface Props {
  phone: string
  direction: 'inbound' | 'outbound'
  agentId: string
  onCreated: (lead: Lead) => void
}

export default function NewLeadForm({ phone, direction, agentId, onCreated }: Props) {
  const [form, setForm] = useState({
    first_name:   '',
    last_name:    '',
    company_name: '',
    email:        '',
    lead_source:  '',
    notes:        '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, phone, agent_id: agentId }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to save'); return }
    onCreated(data)
  }

  return (
    <form onSubmit={submit} className="bg-gray-800 rounded-xl border border-blue-600 p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="w-4 h-4 text-blue-400" />
        <p className="text-white font-semibold text-sm">New Lead</p>
        <span className="ml-auto text-xs text-gray-500 font-mono">{phone}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="First Name" value={form.first_name} onChange={set('first_name')} />
        <Field label="Last Name"  value={form.last_name}  onChange={set('last_name')} />
      </div>

      <Field label="Company Name" value={form.company_name} onChange={set('company_name')} />
      <Field label="Email"        value={form.email}        onChange={set('email')} type="email" />

      <Field
        label={direction === 'inbound' ? 'Inbound Lead Source' : 'Lead Source'}
        value={form.lead_source}
        onChange={set('lead_source')}
        placeholder={direction === 'inbound' ? 'e.g. Google, Referral, Website' : 'e.g. Cold Call, List'}
      />

      <div>
        <label className="text-gray-400 text-xs uppercase tracking-widest mb-1 block">Notes</label>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={2}
          placeholder="Quick notes from the call…"
          className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={saving || !phone}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Save Lead'}
      </button>
    </form>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-gray-400 text-xs uppercase tracking-widest mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
      />
    </div>
  )
}
