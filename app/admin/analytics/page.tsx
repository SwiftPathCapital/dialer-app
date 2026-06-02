'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneIncoming, PhoneOutgoing, Phone, FileText, BadgeDollarSign, X, Clock, Layers } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import type { LeadSourceRow } from '@/app/api/admin/lead-pipeline/route'

type Range = 'today' | 'week' | 'month' | 'all'
type DetailKey = 'all' | 'inbound' | 'outbound' | 'apps' | 'funded'

interface DispoRow { disposition: string; count: number }

interface AnalyticsData {
  range: Range
  totals: { all: number; inbound: number; outbound: number; apps: number; funded: number }
  byDisposition: {
    all: DispoRow[]
    inbound: DispoRow[]
    outbound: DispoRow[]
  }
}

interface CallDetail {
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  started_at: string
  duration_seconds: number | null
  disposition: string | null
  status: string
  agents: { id: string; name: string } | null
}

const RANGE_LABELS: Record<Range, string> = {
  today: 'Today',
  week:  'Last 7 Days',
  month: 'Last 30 Days',
  all:   'All Time',
}

const DETAIL_LABELS: Record<DetailKey, string> = {
  all:      'All Calls',
  inbound:  'Inbound Calls',
  outbound: 'Outbound Calls',
  apps:     'Apps',
  funded:   'Funded Deals',
}

const DISPO_COLORS: Record<string, string> = {
  'Interested':         'bg-green-900/50 text-green-300',
  'Callback':           'bg-blue-900/50 text-blue-300',
  'App Received':       'bg-teal-900/50 text-teal-300',
  'App Signed':         'bg-teal-900/50 text-teal-300',
  'Docs Received':      'bg-indigo-900/50 text-indigo-300',
  'Pending App & Docs': 'bg-amber-900/50 text-amber-300',
  'Deal Funded':        'bg-emerald-900/50 text-emerald-300',
  'Not Interested':     'bg-red-900/50 text-red-300',
  'No Answer':          'bg-gray-700/50 text-gray-400',
  'Left Voicemail':     'bg-purple-900/50 text-purple-300',
  'Wrong Number':       'bg-yellow-900/50 text-yellow-300',
  'DNC':                'bg-orange-900/50 text-orange-300',
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function pct(count: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((count / total) * 100)}%`
}

function DispoTable({ rows, total, title, icon }: {
  rows: DispoRow[]
  total: number
  title: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex-1 min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="ml-auto text-xs text-gray-500">{total} total</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-600 text-sm p-4">No calls in this range.</p>
      ) : (
        <div className="divide-y divide-gray-700/50">
          {rows.map(({ disposition, count }) => (
            <div key={disposition} className="flex items-center gap-3 px-4 py-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DISPO_COLORS[disposition] ?? 'bg-gray-700 text-gray-400'}`}>
                {disposition}
              </span>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: pct(count, total) }}
                  />
                </div>
              </div>
              <span className="text-gray-300 text-sm font-medium shrink-0 w-6 text-right">{count}</span>
              <span className="text-gray-600 text-xs shrink-0 w-8 text-right">{pct(count, total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailModal({ detailKey, range, onClose }: { detailKey: DetailKey; range: Range; onClose: () => void }) {
  const [calls, setCalls] = useState<CallDetail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/analytics?range=${range}&detail=${detailKey}`)
      .then(r => r.json())
      .then(d => { setCalls(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [detailKey, range])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-white font-semibold">{DETAIL_LABELS[detailKey]}</h2>
            <p className="text-gray-500 text-xs mt-0.5">{RANGE_LABELS[range]} · {calls.length} calls</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="text-gray-500 text-sm p-5">Loading…</p>
          ) : calls.length === 0 ? (
            <p className="text-gray-600 text-sm p-5">No calls in this range.</p>
          ) : (
            <div className="divide-y divide-gray-800">
              {calls.map((call, i) => {
                const number = call.direction === 'inbound' ? call.from_number : call.to_number
                return (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <span className={`p-2 rounded-full shrink-0 ${call.direction === 'inbound' ? 'bg-green-900/40 text-green-400' : 'bg-blue-900/40 text-blue-400'}`}>
                      {call.direction === 'inbound' ? <PhoneIncoming className="w-3.5 h-3.5" /> : <PhoneOutgoing className="w-3.5 h-3.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{number}</p>
                      <p className="text-gray-500 text-xs">
                        {call.agents?.name || 'No agent'} · {new Date(call.started_at).toLocaleString()}
                      </p>
                    </div>
                    {call.disposition && (
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${DISPO_COLORS[call.disposition] ?? 'bg-gray-700 text-gray-400'}`}>
                        {call.disposition}
                      </span>
                    )}
                    {call.duration_seconds != null && call.duration_seconds > 0 && (
                      <div className="flex items-center gap-1 text-gray-400 text-xs shrink-0">
                        <Clock className="w-3 h-3" />
                        {fmt(call.duration_seconds)}
                      </div>
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

const STATUS_COLORS: Record<string, string> = {
  'Interested':           '#16a34a',
  'Callback':             '#2563eb',
  'No Answer':            '#4b5563',
  'Left Voicemail':       '#7c3aed',
  'New':                  '#374151',
  'App Received':         '#0d9488',
  'Docs Received':        '#4338ca',
  'Pending App & Docs':   '#d97706',
  'Deal Funded':          '#059669',
  'Not Interested':       '#dc2626',
  'DNC':                  '#ea580c',
  'Wrong Number':         '#ca8a04',
}

function LeadPipelineSection({ rows }: { rows: LeadSourceRow[] }) {
  if (rows.length === 0) return <p className="text-gray-600 text-sm">No lead data.</p>

  return (
    <div className="space-y-3">
      {rows.map(row => {
        const statusEntries = Object.entries(row.by_status).sort((a, b) => b[1] - a[1])
        return (
          <div key={row.lead_type} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold text-sm">{row.lead_type}</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-blue-400 font-medium">{row.dialable.toLocaleString()} dialable</span>
                <span className="text-teal-400">{row.pipeline} in pipeline</span>
                <span className="text-red-400">{row.dead} dead</span>
                <span className="text-gray-500">{row.total.toLocaleString()} total</span>
              </div>
            </div>

            {/* Stacked bar */}
            <div className="flex h-2.5 rounded-full overflow-hidden mb-3 bg-gray-700">
              {statusEntries.map(([status, count]) => (
                <div
                  key={status}
                  title={`${status}: ${count}`}
                  style={{
                    width: `${(count / row.total) * 100}%`,
                    backgroundColor: STATUS_COLORS[status] ?? '#6b7280',
                  }}
                />
              ))}
            </div>

            {/* Status breakdown */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {statusEntries.map(([status, count]) => (
                <span key={status} className="text-xs text-gray-400 flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[status] ?? '#6b7280' }}
                  />
                  {status}: <span className="text-gray-200 font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [range, setRange] = useState<Range>('today')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [openDetail, setOpenDetail] = useState<DetailKey | null>(null)
  const [pipeline, setPipeline] = useState<LeadSourceRow[]>([])
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const load = useCallback(async (r: Range) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics?range=${r}`)
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load(range)
    fetch('/api/admin/lead-pipeline')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPipeline(d) })
      .finally(() => setPipelineLoading(false))
  }, [agent, agentLoading, router, range, load])

  if (!agent) return null

  const summaryCards: { label: string; value: number; icon: React.ReactNode; color: string; key: DetailKey }[] = data ? [
    { label: 'Total Calls', value: data.totals.all,      icon: <Phone className="w-4 h-4" />,            color: 'text-white',         key: 'all' },
    { label: 'Inbound',     value: data.totals.inbound,  icon: <PhoneIncoming className="w-4 h-4" />,    color: 'text-green-400',     key: 'inbound' },
    { label: 'Outbound',    value: data.totals.outbound, icon: <PhoneOutgoing className="w-4 h-4" />,    color: 'text-blue-400',      key: 'outbound' },
    { label: 'Apps',        value: data.totals.apps,     icon: <FileText className="w-4 h-4" />,         color: 'text-teal-400',      key: 'apps' },
    { label: 'Funded',      value: data.totals.funded,   icon: <BadgeDollarSign className="w-4 h-4" />, color: 'text-emerald-400',   key: 'funded' },
  ] : []

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
          {(Object.keys(RANGE_LABELS) as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                range === r ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards — clickable */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4 animate-pulse h-20" />
            ))
          : summaryCards.map(({ label, value, icon, color, key }) => (
              <button
                key={label}
                onClick={() => setOpenDetail(key)}
                className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-left hover:border-gray-500 hover:bg-gray-750 transition-colors group"
              >
                <div className={`flex items-center gap-2 mb-1 ${color}`}>
                  {icon}
                  <span className="text-xs text-gray-500 group-hover:text-gray-400">{label}</span>
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </button>
            ))
        }
      </div>

      {/* Disposition tables */}
      {loading ? (
        <div className="flex gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-1 bg-gray-800 rounded-xl border border-gray-700 h-64 animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <div className="flex flex-col lg:flex-row gap-4">
          <DispoTable
            title="All Calls"
            total={data.totals.all}
            rows={data.byDisposition.all}
            icon={<Phone className="w-4 h-4 text-gray-400" />}
          />
          <DispoTable
            title="Inbound"
            total={data.totals.inbound}
            rows={data.byDisposition.inbound}
            icon={<PhoneIncoming className="w-4 h-4 text-green-400" />}
          />
          <DispoTable
            title="Outbound"
            total={data.totals.outbound}
            rows={data.byDisposition.outbound}
            icon={<PhoneOutgoing className="w-4 h-4 text-blue-400" />}
          />
        </div>
      ) : null}

      {/* Lead Pipeline by Source */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-gray-400" />
          <h2 className="text-white font-semibold">Lead Pipeline by Source</h2>
          <span className="text-xs text-gray-500 ml-1">all time · updates live</span>
        </div>
        {pipelineLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <LeadPipelineSection rows={pipeline} />
        )}
      </div>

      {/* Detail modal */}
      {openDetail && (
        <DetailModal
          detailKey={openDetail}
          range={range}
          onClose={() => setOpenDetail(null)}
        />
      )}
    </div>
  )
}
