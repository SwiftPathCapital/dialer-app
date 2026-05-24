'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Search, Building2 } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { Lead } from '@/lib/types'

export default function LeadsPage() {
  const { agent, agentLoading, makeCall } = useSoftphone()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    loadLeads()
  }, [agent, agentLoading, router])

  async function loadLeads(q = '') {
    setLoading(true)
    const params = new URLSearchParams({ agent_id: agent!.id, limit: '200' })
    if (q) params.set('search', q)
    const res = await fetch(`/api/leads?${params}`)
    const data = await res.json()
    setLeads(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout((handleSearch as any)._t)
    ;(handleSearch as any)._t = setTimeout(() => loadLeads(value), 300)
  }

  function dial(phone: string) {
    makeCall(phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1'))
    router.push('/dashboard')
  }

  if (!agent) return null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Leads</h1>
        <span className="text-gray-500 text-sm">{leads.length} leads</span>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by name, company, or phone…"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-gray-600 text-sm">No leads found</p>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const displayName = lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown'
            const contactName = lead.company_name ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null
            const phone = lead.phone

            return (
              <div
                key={lead.id}
                className="flex items-center gap-4 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700"
              >
                <div className="p-2 rounded-full bg-blue-900/40 text-blue-400 shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{displayName}</p>
                  <p className="text-gray-500 text-xs truncate">
                    {contactName && <span>{contactName} · </span>}
                    {phone || 'No phone'}
                    {lead.state && <span> · {lead.state}</span>}
                  </p>
                </div>
                {lead.status && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 shrink-0">
                    {lead.status}
                  </span>
                )}
                {phone && (
                  <button
                    onClick={() => dial(phone)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
