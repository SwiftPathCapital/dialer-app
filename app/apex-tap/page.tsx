'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Plus, Copy, Check } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface ApexTapTag {
  id: string
  slug: string
  status: 'unclaimed' | 'active' | 'disabled'
  tier: 'apex_tag' | 'card_pro' | 'biz_kit'
  created_at: string
  claimed_at: string | null
  org_name: string | null
  active_url: string | null
}

interface ProvisionResult {
  slug: string
  claim_code: string
  tier: string
}

const RESOLVER_BASE = 'https://qbaubmexcmduhqmbixen.supabase.co/functions/v1/resolve'
const TIER_LABEL: Record<string, string> = { apex_tag: 'Apex Tag', card_pro: 'Card Pro', biz_kit: 'Biz Kit' }
const STATUS_STYLE: Record<string, string> = {
  unclaimed: 'bg-gray-700 text-gray-300',
  active: 'bg-green-900/50 text-green-400 border border-green-700/50',
  disabled: 'bg-red-900/50 text-red-400 border border-red-700/50',
}

export default function ApexTapPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  const [tags, setTags] = useState<ApexTapTag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const [showProvision, setShowProvision] = useState(false)
  const [provisionCount, setProvisionCount] = useState(10)
  const [provisionTier, setProvisionTier] = useState('apex_tag')
  const [provisioning, setProvisioning] = useState(false)
  const [justProvisioned, setJustProvisioned] = useState<ProvisionResult[] | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (statusFilter) params.set('status', statusFilter)
    fetch(`/api/apex-tap/tags?${params}`)
      .then(r => r.json())
      .then(d => {
        const rows = Array.isArray(d) ? d : []
        setTags(rows)
        setDrafts(Object.fromEntries(rows.map((t: ApexTapTag) => [t.id, t.active_url ?? ''])))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [search, statusFilter])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
  }, [agent, agentLoading, router, load])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search, statusFilter, load])

  async function saveDestination(tagId: string) {
    const url = drafts[tagId]?.trim()
    if (!url) return
    setSaving(tagId)
    setError('')
    const res = await fetch(`/api/apex-tap/tags/${tagId}/destination`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'link' }),
    })
    setSaving(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed to save destination')
      return
    }
    load()
  }

  async function provision(e: React.FormEvent) {
    e.preventDefault()
    setProvisioning(true)
    setError('')
    const res = await fetch('/api/apex-tap/tags/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: provisionCount, tier: provisionTier }),
    })
    const data = await res.json()
    setProvisioning(false)
    if (!res.ok) {
      setError(data.error || 'Failed to provision tags')
      return
    }
    setJustProvisioned(data)
    setShowProvision(false)
    load()
  }

  function copyProvisioned() {
    if (!justProvisioned) return
    const text = justProvisioned.map(t => `${t.slug}\t${t.claim_code}\t${t.tier}`).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!agent) return null

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <QrCode className="w-6 h-6 text-cyan-400" /> Apex Tap
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">Provision tags and manage where they resolve to.</p>
        </div>
        <button
          onClick={() => { setShowProvision(v => !v); setJustProvisioned(null); setError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Provision Tags
        </button>
      </div>

      {justProvisioned && (
        <div className="bg-green-950/30 border border-green-800/50 rounded-xl p-4 mb-6">
          <p className="text-green-300 text-sm font-medium mb-2">
            {justProvisioned.length} tags created — claim codes shown once, for printing:
          </p>
          <div className="bg-gray-900 rounded-lg px-3 py-2 font-mono text-xs text-gray-300 max-h-48 overflow-y-auto space-y-0.5">
            {justProvisioned.map(t => (
              <div key={t.slug} className="flex gap-4">
                <span className="text-gray-500 w-40 shrink-0">{t.slug}</span>
                <span>{t.claim_code}</span>
              </div>
            ))}
          </div>
          <button onClick={copyProvisioned} className="mt-2 flex items-center gap-1.5 text-green-500/70 hover:text-green-400 text-xs transition-colors">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy all'}
          </button>
        </div>
      )}

      {showProvision && (
        <form onSubmit={provision} className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-widest block mb-1">Count</label>
              <input
                type="number"
                min={1}
                max={500}
                value={provisionCount}
                onChange={e => setProvisionCount(parseInt(e.target.value) || 1)}
                className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-widest block mb-1">Tier</label>
              <select
                value={provisionTier}
                onChange={e => setProvisionTier(e.target.value)}
                className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="apex_tag">Apex Tag</option>
                <option value="card_pro">Card Pro</option>
                <option value="biz_kit">Biz Kit</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={provisioning}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            {provisioning ? 'Creating…' : `Create ${provisionCount} Tag${provisionCount === 1 ? '' : 's'}`}
          </button>
        </form>
      )}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="flex gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by slug…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-500 transition-colors"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
        >
          <option value="">All statuses</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : tags.length === 0 ? (
        <p className="text-gray-600 text-sm">No tags found.</p>
      ) : (
        <div className="space-y-2">
          {tags.map(tag => (
            <div key={tag.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <a
                    href={`${RESOLVER_BASE}/${tag.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-gray-300 font-mono hover:text-cyan-400"
                  >
                    /{tag.slug}
                  </a>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[tag.status]}`}>{tag.status}</span>
                  <span className="text-xs text-gray-500">{TIER_LABEL[tag.tier]}</span>
                  {tag.org_name && <span className="text-xs text-gray-500">· {tag.org_name}</span>}
                </div>
              </div>
              {tag.status !== 'unclaimed' && (
                <div className="flex gap-2">
                  <input
                    value={drafts[tag.id] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [tag.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveDestination(tag.id)}
                    placeholder="https://…"
                    className="flex-1 bg-gray-950 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
                  />
                  <button
                    onClick={() => saveDestination(tag.id)}
                    disabled={saving === tag.id || !drafts[tag.id]?.trim() || drafts[tag.id] === (tag.active_url ?? '')}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-sm font-semibold transition-colors shrink-0"
                  >
                    {saving === tag.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
