'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Users, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Tenant {
  id: string
  name: string
  slug: string
  created_at: string
  agent_count: number
  hidden_features: string[]
}

const TOGGLEABLE_FEATURES = [
  { href: '/control-center', label: 'Control Center' },
  { href: '/dashboard', label: 'Softphone' },
  { href: '/contact-center', label: 'Conversations' },
  { href: '/voicemail', label: 'Voicemail' },
  { href: '/callbacks', label: 'Callbacks' },
  { href: '/calls', label: 'Call Log' },
  { href: '/admin/monitor', label: 'Admin: Monitor' },
  { href: '/admin/analytics', label: 'Admin: Analytics' },
  { href: '/admin/calls', label: 'Admin: Call Center' },
  { href: '/admin/callbacks', label: 'Admin: Callbacks' },
  { href: '/admin/calendars', label: 'Admin: Calendars' },
  { href: '/admin/groups', label: 'Admin: Groups' },
  { href: '/admin/tags', label: 'Admin: Tags' },
  { href: '/admin/config', label: 'Admin: Config' },
]

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let out = ''
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function PlatformTenantsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [justCreated, setJustCreated] = useState<{ tenantName: string; email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingFeatures, setSavingFeatures] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState(randomPassword())

  const load = useCallback(() => {
    if (!agent) return
    fetch(`/api/platform/tenants?agent_id=${agent.id}`)
      .then(r => r.json())
      .then(d => { setTenants(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    if (!agent.is_platform_admin) { router.push('/dashboard'); return }
    load()
  }, [agent, agentLoading, router, load])

  async function createTenant(e: React.FormEvent) {
    e.preventDefault()
    if (!agent || !name.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/platform/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agent.id,
        name: name.trim(),
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminPassword,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      return
    }
    setJustCreated({ tenantName: name.trim(), email: adminEmail.trim(), password: adminPassword })
    setName('')
    setAdminName('')
    setAdminEmail('')
    setAdminPassword(randomPassword())
    setShowForm(false)
    load()
  }

  async function toggleTenantFeature(tenant: Tenant, featureHref: string) {
    if (!agent) return
    const hidden = tenant.hidden_features ?? []
    const next = hidden.includes(featureHref) ? hidden.filter(f => f !== featureHref) : [...hidden, featureHref]
    setSavingFeatures(tenant.id)
    setTenants(prev => prev.map(t => t.id === tenant.id ? { ...t, hidden_features: next } : t))
    await fetch('/api/platform/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id, tenant_id: tenant.id, hidden_features: next }),
    }).catch(() => {})
    setSavingFeatures(null)
  }

  function copyCreds() {
    if (!justCreated) return
    navigator.clipboard.writeText(`Login: ${justCreated.email}\nTemporary password: ${justCreated.password}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!agent || !agent.is_platform_admin) return null

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-gray-400 text-sm mt-0.5">Every tenant on this platform — you're the only one who can see this page.</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setJustCreated(null); setError('') }}
          className="neon-orbit flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
          style={{ '--glow-color': '#22d3ee', '--glow-color-2': '#818cf8' } as React.CSSProperties}
        >
          <Plus className="w-4 h-4" /> New Client
        </button>
      </div>

      {justCreated && (
        <div className="bg-green-950/30 border border-green-800/50 rounded-xl p-4 mb-6">
          <p className="text-green-300 text-sm font-medium mb-2">
            {justCreated.tenantName} created — share these credentials with their admin:
          </p>
          <div className="bg-gray-900 rounded-lg px-3 py-2 font-mono text-xs text-gray-300 flex items-center justify-between gap-3">
            <div>
              <p>Login: {justCreated.email}</p>
              <p>Temp password: {justCreated.password}</p>
            </div>
            <button onClick={copyCreds} className="shrink-0 text-gray-400 hover:text-white transition-colors">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-green-500/70 text-xs mt-2">They should log in and change this password right away.</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={createTenant} className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6 space-y-3">
          <label className="text-gray-400 text-xs uppercase tracking-widest block">Business Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Sunlight Contractors"
            className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
          />

          <label className="text-gray-400 text-xs uppercase tracking-widest block pt-2">First Admin</label>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={adminName}
              onChange={e => setAdminName(e.target.value)}
              placeholder="Full name"
              className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
            />
            <input
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="Temporary password"
              className="flex-1 bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
            />
            <button
              type="button"
              onClick={() => setAdminPassword(randomPassword())}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors shrink-0"
            >
              Regenerate
            </button>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving || !name.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()}
            className={`w-full py-2.5 bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 disabled:opacity-40 text-white font-semibold text-sm rounded-lg transition-opacity ${
              !saving && name.trim() && adminName.trim() && adminEmail.trim() && adminPassword.trim() ? 'neon-orbit' : ''
            }`}
            style={{ '--glow-color': '#22d3ee', '--glow-color-2': '#a78bfa' } as React.CSSProperties}
          >
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-gray-600 text-sm">No clients yet.</p>
      ) : (
        <div className="space-y-2">
          {tenants.map(t => {
            const isOpen = expanded === t.id
            return (
              <div key={t.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-cyan-950/50 border border-cyan-700/40 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t.name}</p>
                      <p className="text-gray-500 text-xs">{t.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                      <Users className="w-3.5 h-3.5" /> {t.agent_count}
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                    <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">
                      Visible Features {savingFeatures === t.id && <span className="text-gray-600 normal-case">saving…</span>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TOGGLEABLE_FEATURES.map(f => {
                        const hidden = (t.hidden_features ?? []).includes(f.href)
                        return (
                          <button
                            key={f.href}
                            onClick={() => toggleTenantFeature(t, f.href)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              hidden
                                ? 'bg-gray-900 border-gray-700 text-gray-500'
                                : 'bg-cyan-600 border-cyan-500 text-white'
                            }`}
                          >
                            {f.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-gray-600 text-xs mt-2">
                      Hidden here is hidden for every agent in {t.name}, regardless of their individual permissions.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
