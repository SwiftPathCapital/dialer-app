'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Droplets, Plus, Search, UserPlus, MapPin, Image as ImageIcon, Shapes } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { MoistureProject, Lead } from '@/lib/types'

function contactName(lead?: MoistureProject['lead']) {
  if (!lead) return 'Unknown contact'
  return lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown contact'
}

export default function MoistureMappingPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  const [projects, setProjects] = useState<MoistureProject[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [projectName, setProjectName] = useState('')
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Lead[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const load = useCallback(() => {
    if (!agent) return
    fetch(`/api/moisture/projects?agent_id=${agent.id}`)
      .then(r => r.json())
      .then(d => { setProjects(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [agent])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load()
  }, [agent, agentLoading, router, load])

  useEffect(() => {
    if (!agent || mode !== 'search' || !search.trim()) { setSearchResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/leads?agent_id=${agent.id}&search=${encodeURIComponent(search.trim())}&limit=8`)
        .then(r => r.json())
        .then(d => setSearchResults(Array.isArray(d) ? d : []))
        .catch(() => setSearchResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [search, mode, agent])

  function resetForm() {
    setProjectName(''); setMode('search'); setSearch(''); setSearchResults([])
    setSelectedLead(null); setNewName(''); setNewPhone(''); setNewEmail(''); setError('')
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!agent || !projectName.trim()) return
    setError('')

    let leadId = selectedLead?.id
    if (mode === 'new') {
      if (!newName.trim()) { setError('Customer name is required'); return }
      const [first, ...rest] = newName.trim().split(' ')
      setCreating(true)
      const leadRes = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent.id,
          first_name: first,
          last_name: rest.join(' ') || null,
          phone: newPhone || null,
          email: newEmail || null,
          lead_source: 'Moisture Mapping',
        }),
      })
      const leadData = await leadRes.json()
      if (!leadRes.ok) { setCreating(false); setError(leadData.error || 'Could not create customer'); return }
      leadId = leadData.id
    }

    if (!leadId) { setError('Select or add a customer first'); return }

    setCreating(true)
    const res = await fetch('/api/moisture/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id, lead_id: leadId, name: projectName.trim() }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setError(data.error || 'Something went wrong'); return }
    router.push(`/moisture-mapping/${data.id}`)
  }

  if (!agent) return null

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Droplets className="w-6 h-6 text-cyan-400" /> Moisture Mapping
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">Floor-plan moisture tracking for active remediation jobs</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); resetForm() }}
          className="neon-breathe flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
          style={{ '--glow-color': '#22d3ee' } as React.CSSProperties}
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={createProject} className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6 space-y-4">
          <div>
            <label className="text-gray-400 text-xs uppercase tracking-widest block mb-1.5">Project Name</label>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="e.g. 412 Maple St — Basement Water Damage"
              className="w-full bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
            />
          </div>

          <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'search' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Search className="w-3.5 h-3.5" /> Existing Customer
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'new' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <UserPlus className="w-3.5 h-3.5" /> New Customer
            </button>
          </div>

          {mode === 'search' ? (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={selectedLead ? contactName(selectedLead as unknown as MoistureProject['lead']) : search}
                  onChange={e => { setSearch(e.target.value); setSelectedLead(null) }}
                  placeholder="Search by name, company, or phone…"
                  className="w-full bg-gray-900 text-white text-sm rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
                />
              </div>
              {!selectedLead && searchResults.length > 0 && (
                <div className="mt-2 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => { setSelectedLead(l); setSearch(''); setSearchResults([]) }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                      {contactName(l as unknown as MoistureProject['lead'])} {l.phone && <span className="text-gray-500">· {l.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Customer name"
                className="col-span-2 bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
              />
              <input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Phone"
                className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
              />
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="Email (optional)"
                className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-600"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={creating || !projectName.trim() || (mode === 'search' ? !selectedLead : !newName.trim())}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-90 disabled:opacity-40 text-white font-semibold text-sm rounded-lg transition-opacity"
          >
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-gray-600 text-sm">No moisture mapping projects yet.</p>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => router.push(`/moisture-mapping/${p.id}`)}
              className="w-full text-left flex items-center gap-4 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700 hover:border-cyan-600/50 transition-colors"
            >
              <div className="p-2 rounded-full bg-cyan-950/50 text-cyan-400 shrink-0">
                {p.floor_plan_type === 'image' ? <ImageIcon className="w-4 h-4" /> : p.floor_plan_type === 'drawn' ? <Shapes className="w-4 h-4" /> : <Droplets className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{p.name}</p>
                <p className="text-gray-500 text-xs truncate">{contactName(p.lead)}</p>
              </div>
              {(p.reading_point_count ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                  <MapPin className="w-3.5 h-3.5" /> {p.reading_point_count}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${p.status === 'completed' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-blue-900/40 text-blue-300'}`}>
                {p.status === 'completed' ? 'Completed' : 'In Progress'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
