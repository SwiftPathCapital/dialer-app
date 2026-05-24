'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Search, Building2, ChevronRight } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import Dialpad from '@/components/Dialpad'
import ActiveCall from '@/components/ActiveCall'
import StatusSelector from '@/components/StatusSelector'
import VoicemailGreeting from '@/components/VoicemailGreeting'
import { Lead } from '@/lib/types'

export default function DashboardPage() {
  const { agent, agentLoading, makeCall } = useSoftphone()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    loadLeads('')
  }, [agent, agentLoading, router])

  async function loadLeads(q: string) {
    setLeadsLoading(true)
    const params = new URLSearchParams({ agent_id: agent!.id, limit: '200' })
    if (q) params.set('search', q)
    const res = await fetch(`/api/leads?${params}`)
    const data = await res.json()
    setLeads(Array.isArray(data) ? data : [])
    setLeadsLoading(false)
  }

  function handleSearch(value: string) {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadLeads(value), 300)
  }

  function dial(lead: Lead) {
    if (!lead.phone) return
    const e164 = lead.phone.replace(/\D/g, '').replace(/^1?(\d{10})$/, '+1$1')
    setActiveLead(lead)
    makeCall(e164)
  }

  if (!agent) return null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Softphone</h1>
          <p className="text-gray-400 text-sm mt-0.5">{agent.name} · ext. {agent.extension || agent.sip_username}</p>
        </div>
        <StatusSelector />
      </div>

      <div className="flex flex-wrap gap-6">
        {/* Left: dialpad + active call */}
        <div className="space-y-4">
          <ActiveCall lead={activeLead} />
          <Dialpad />
          <VoicemailGreeting />
        </div>

        {/* Right: preview dialer */}
        <div className="flex-1 min-w-72 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-xs uppercase tracking-widest">Preview Dialer</p>
            <span className="text-gray-600 text-xs">{leads.length} leads</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {leadsLoading ? (
            <p className="text-gray-600 text-sm">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="text-gray-600 text-sm">No leads found</p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
              {leads.map(lead => {
                const company = lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.name || 'Unknown'
                const contact = lead.company_name ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null
                const isActive = activeLead?.id === lead.id

                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
                      isActive
                        ? 'bg-blue-900/30 border-blue-600'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className={`p-2 rounded-full shrink-0 ${isActive ? 'bg-blue-700/40 text-blue-300' : 'bg-gray-700 text-gray-400'}`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{company}</p>
                      <p className="text-gray-500 text-xs truncate">
                        {contact && `${contact} · `}{lead.phone || 'No phone'}
                        {lead.state && ` · ${lead.state}`}
                      </p>
                    </div>
                    {lead.status && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 shrink-0 hidden md:block">
                        {lead.status}
                      </span>
                    )}
                    {lead.phone ? (
                      <button
                        onClick={() => dial(lead)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors shrink-0 ${
                          isActive ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-700 hover:bg-green-600'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {isActive ? 'Calling' : 'Call'}
                      </button>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
