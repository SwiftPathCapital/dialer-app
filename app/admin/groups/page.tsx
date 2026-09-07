'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import GroupManager from '@/components/GroupManager'
import { Agent } from '@/lib/types'

export default function AdminGroupsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [tab, setTab] = useState<'groups' | 'agents'>('groups')

  // New agent form
  const [form, setForm] = useState({ name: '', email: '', sip_username: '', sip_password: '', extension: '' })
  const [saving, setSaving] = useState(false)
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ extension: '', sip_username: '', sip_password: '' })
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    loadAgents()
  }, [agent, router])

  async function loadAgents() {
    if (!agent) return
    const res = await fetch(`/api/agents?agent_id=${agent.id}`)
    const data = await res.json()
    setAgents(Array.isArray(data) ? data : [])
  }

  async function createAgent() {
    if (!form.name || !form.email) return
    setSaving(true)
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, agent_id: agent?.id }),
    })
    setForm({ name: '', email: '', sip_username: '', sip_password: '', extension: '' })
    setSaving(false)
    await loadAgents()
  }

  async function deleteAgent(id: string) {
    if (!confirm('Remove this agent?')) return
    await fetch(`/api/agents?id=${id}`, { method: 'DELETE' })
    await loadAgents()
  }

  function startEdit(a: Agent) {
    setEditingId(a.id)
    setEditForm({ extension: a.extension || '', sip_username: a.sip_username || '', sip_password: '' })
    setEditError(null)
  }

  async function saveEdit(id: string) {
    setEditError(null)
    // Only include fields that have values to avoid blanking existing data
    const body: Record<string, string> = { id }
    if (editForm.extension !== undefined) body.extension = editForm.extension
    if (editForm.sip_username) body.sip_username = editForm.sip_username
    if (editForm.sip_password) body.sip_password = editForm.sip_password

    const res = await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      setEditError(data.error || `Save failed (${res.status})`)
      return
    }
    setEditingId(null)
    await loadAgents()
  }

  if (!agent) return null

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-2xl font-bold text-white mb-5">Admin</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700">
        {(['groups', 'agents'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'groups' && (
        <div className="flex-1 overflow-auto">
          <GroupManager />
        </div>
      )}

      {tab === 'agents' && (
        <div className="max-w-2xl space-y-6">
          {/* Agent list */}
          <div className="space-y-2">
            {agents.map(a => (
              <div key={a.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {/* Agent header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">{a.name}</p>
                    <p className="text-gray-400 text-xs">{a.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.status === 'available' ? 'bg-green-900/40 text-green-400' :
                    a.status === 'busy' ? 'bg-yellow-900/40 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {a.status}
                  </span>
                  {editingId === a.id ? (
                    <>
                      <button onClick={() => saveEdit(a.id)} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(a)} className="text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteAgent(a.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>

                {/* Inline edit fields */}
                {editingId === a.id && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-700 grid grid-cols-1 gap-2">
                    {editError && (
                      <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded px-2 py-1">{editError}</p>
                    )}
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Direct Line / Extension (e.g. +12345678901)</label>
                      <input
                        value={editForm.extension}
                        onChange={e => setEditForm(p => ({ ...p, extension: e.target.value }))}
                        placeholder="+1..."
                        className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">SIP Username</label>
                      <input
                        value={editForm.sip_username}
                        onChange={e => setEditForm(p => ({ ...p, sip_username: e.target.value }))}
                        className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">SIP Password (leave blank to keep current)</label>
                      <input
                        type="password"
                        value={editForm.sip_password}
                        onChange={e => setEditForm(p => ({ ...p, sip_password: e.target.value }))}
                        placeholder="••••••••"
                        className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                      />
                    </div>
                  </div>
                )}

                {/* Summary line when not editing */}
                {editingId !== a.id && (
                  <div className="px-4 pb-2 flex gap-4 text-xs text-gray-500">
                    <span>SIP: {a.sip_username || <span className="text-yellow-600">not set</span>}</span>
                    <span>Direct: {a.extension || <span className="text-gray-600">not set</span>}</span>
                  </div>
                )}
              </div>
            ))}
            {agents.length === 0 && <p className="text-gray-600 text-sm">No agents yet</p>}
          </div>

          {/* Add agent form */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <p className="text-white font-semibold mb-1">Add Agent</p>
            {[
              { key: 'name', placeholder: 'Full name', type: 'text' },
              { key: 'email', placeholder: 'Email', type: 'email' },
              { key: 'sip_username', placeholder: 'Telnyx SIP username', type: 'text' },
              { key: 'sip_password', placeholder: 'Telnyx SIP password', type: 'password' },
              { key: 'extension', placeholder: 'Extension (optional)', type: 'text' },
            ].map(({ key, placeholder, type }) => (
              <input
                key={key}
                type={type}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
              />
            ))}
            <button
              onClick={createAgent}
              disabled={!form.name || !form.email || saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Agent
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
