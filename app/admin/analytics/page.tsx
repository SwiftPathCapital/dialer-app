'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneIncoming, PhoneOutgoing, Phone, FileText, BadgeDollarSign } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

type Range = 'today' | 'week' | 'month' | 'all'

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

const RANGE_LABELS: Record<Range, string> = {
  today: 'Today',
  week:  'Last 7 Days',
  month: 'Last 30 Days',
  all:   'All Time',
}

const DISPO_COLORS: Record<string, string> = {
  'Interested':         'bg-green-900/50 text-green-300',
  'Callback':           'bg-blue-900/50 text-blue-300',
  'App Received':       'bg-teal-900/50 text-teal-300',
  'Docs Received':      'bg-indigo-900/50 text-indigo-300',
  'Pending App & Docs': 'bg-amber-900/50 text-amber-300',
  'Deal Funded':        'bg-emerald-900/50 text-emerald-300',
  'Not Interested':     'bg-red-900/50 text-red-300',
  'No Answer':          'bg-gray-700/50 text-gray-400',
  'Left Voicemail':     'bg-purple-900/50 text-purple-300',
  'Wrong Number':       'bg-yellow-900/50 text-yellow-300',
  'DNC':                'bg-orange-900/50 text-orange-300',
  'No Disposition':     'bg-gray-800 text-gray-500',
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

export default function AnalyticsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [range, setRange] = useState<Range>('today')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

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
  }, [agent, agentLoading, router, range, load])

  if (!agent) return null

  const summaryCards = data ? [
    { label: 'Total Calls', value: data.totals.all,     icon: <Phone className="w-4 h-4" />,              color: 'text-white' },
    { label: 'Inbound',     value: data.totals.inbound, icon: <PhoneIncoming className="w-4 h-4" />,      color: 'text-green-400' },
    { label: 'Outbound',    value: data.totals.outbound,icon: <PhoneOutgoing className="w-4 h-4" />,      color: 'text-blue-400' },
    { label: 'Apps',        value: data.totals.apps,    icon: <FileText className="w-4 h-4" />,           color: 'text-teal-400' },
    { label: 'Funded',      value: data.totals.funded,  icon: <BadgeDollarSign className="w-4 h-4" />,   color: 'text-emerald-400' },
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
                range === r
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-4 animate-pulse h-20" />
            ))
          : summaryCards.map(({ label, value, icon, color }) => (
              <div key={label} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                <div className={`flex items-center gap-2 mb-1 ${color}`}>
                  {icon}
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
              </div>
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
    </div>
  )
}
