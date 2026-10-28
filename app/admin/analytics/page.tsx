'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneIncoming, PhoneOutgoing, Phone, FileText, BadgeDollarSign, X, Clock, Layers, Users } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import type { LeadSourceRow } from '@/app/api/admin/lead-pipeline/route'
import {
  TEMPLATE_IDS, TEMPLATE_LABELS, TEMPLATE_COLUMNS, rowsToCsv, pctString, statusBreakdown,
  type TemplateId, type ReportRow,
} from '@/lib/reports'

type Range = 'today' | 'week' | 'month' | 'all'
type DetailKey = 'all' | 'inbound' | 'outbound' | 'apps' | 'funded'

interface DispoRow { disposition: string; count: number }

interface AgentRow {
  agent_id: string
  agent_name: string
  all: number
  inbound: number
  outbound: number
  apps: number
  funded: number
}

interface AnalyticsData {
  range: Range
  byAgent: AgentRow[]
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

function DetailModal({ detailKey, range, agentId, filterAgentId, onClose }: { detailKey: DetailKey; range: Range; agentId: string; filterAgentId: string; onClose: () => void }) {
  const [calls, setCalls] = useState<CallDetail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ range, detail: detailKey, agent_id: agentId })
    if (filterAgentId) params.set('filter_agent_id', filterAgentId)
    fetch(`/api/admin/analytics?${params}`)
      .then(r => r.json())
      .then(d => { setCalls(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [detailKey, range, agentId, filterAgentId])

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

interface ReportScheduleRow {
  id: string
  template: TemplateId
  filters: { range?: string; filter_agent_id?: string }
  recipients: string[]
  frequency: 'daily' | 'weekly' | 'monthly'
  hour_utc: number
  day_of_week: number | null
  day_of_month: number | null
  last_sent_at: string | null
  enabled: boolean
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function utcHourToLocal(hourUtc: number): string {
  const d = new Date()
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function describeSchedule(s: ReportScheduleRow): string {
  const at = `${utcHourToLocal(s.hour_utc)} (${s.hour_utc}:00 UTC)`
  if (s.frequency === 'weekly') return `Weekly on ${WEEKDAYS[s.day_of_week ?? 0]} at ${at}`
  if (s.frequency === 'monthly') return `Monthly on day ${s.day_of_month} at ${at}`
  return `Daily at ${at}`
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const inputCls = 'bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'
const labelCls = 'text-gray-500 text-[10px] uppercase tracking-widest block mb-1'

function ScheduleForm({ template, agentId, filterAgentId, filterAgentName, range, onCreated, onCancel }: {
  template: TemplateId; agentId: string; filterAgentId: string; filterAgentName: string; range: Range
  onCreated: () => void; onCancel: () => void
}) {
  const [recipients, setRecipients] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [hourUtc, setHourUtc] = useState(13)
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Agent Performance is a whole-team breakdown and Lead Pipeline is all-time, so only
  // the filters that actually apply to this template are saved and shown.
  const usesRange = template !== 'lead_pipeline'
  const usesAgent = template === 'disposition_summary' || template === 'funded_deals'

  async function save() {
    setError('')
    const list = recipients.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    setSaving(true)
    const res = await fetch('/api/admin/report-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        template,
        filters: { range: usesRange ? range : 'all', ...(usesAgent && filterAgentId ? { filter_agent_id: filterAgentId } : {}) },
        recipients: list,
        frequency,
        hour_utc: hourUtc,
        day_of_week: dayOfWeek,
        day_of_month: dayOfMonth,
      }),
    }).catch(() => null)
    setSaving(false)
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error || 'Could not save schedule')
      return
    }
    onCreated()
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3 my-3">
      <p className="text-gray-400 text-xs">
        Sends with: {usesRange ? RANGE_LABELS[range] : 'All Time'}
        {usesAgent ? ` · ${filterAgentId ? filterAgentName : 'All Agents'}` : ''}
        <span className="text-gray-600"> — change the filters at the top of the page to adjust.</span>
      </p>
      <div>
        <label className={labelCls}>Recipients (comma-separated emails)</label>
        <input
          value={recipients}
          onChange={e => setRecipients(e.target.value)}
          placeholder="name@company.com, other@company.com"
          className={`w-full ${inputCls} text-sm`}
        />
      </div>
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className={labelCls}>Frequency</label>
          <select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)} className={inputCls}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {frequency === 'weekly' && (
          <div>
            <label className={labelCls}>Day</label>
            <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} className={inputCls}>
              {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        {frequency === 'monthly' && (
          <div>
            <label className={labelCls}>Day of Month</label>
            <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} className={inputCls}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>Time</label>
          <select value={hourUtc} onChange={e => setHourUtc(Number(e.target.value))} className={inputCls}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{utcHourToLocal(h)} ({h}:00 UTC)</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || !recipients.trim()}
          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Create Schedule'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition-colors">
          Cancel
        </button>
      </div>
      <p className="text-amber-400/80 text-[11px]">
        Email delivery isn&apos;t connected yet — schedules are saved and run on time, but nothing is sent until an email provider is set up.
      </p>
    </div>
  )
}

function ReportsSection({ data, pipeline, range, filterAgentId, filterAgentName, agentId }: {
  data: AnalyticsData | null; pipeline: LeadSourceRow[]; range: Range
  filterAgentId: string; filterAgentName: string; agentId: string
}) {
  const [active, setActive] = useState<TemplateId | null>(null)
  const [funded, setFunded] = useState<ReportRow[]>([])
  const [fundedLoading, setFundedLoading] = useState(false)
  const [fundedError, setFundedError] = useState('')
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([])
  const [showSchedule, setShowSchedule] = useState(false)

  const loadSchedules = useCallback(() => {
    fetch(`/api/admin/report-schedules?agent_id=${agentId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSchedules(d) })
      .catch(() => {})
  }, [agentId])

  useEffect(() => { loadSchedules() }, [loadSchedules])

  useEffect(() => {
    if (active !== 'funded_deals') return
    setFundedLoading(true)
    setFundedError('')
    const params = new URLSearchParams({ agent_id: agentId, range })
    if (filterAgentId) params.set('filter_agent_id', filterAgentId)
    fetch(`/api/admin/reports/funded-deals?${params}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d?.error || 'Failed to load')
        setFunded(Array.isArray(d.rows) ? d.rows : [])
      })
      .catch(err => { setFunded([]); setFundedError(err.message) })
      .finally(() => setFundedLoading(false))
  }, [active, range, filterAgentId, agentId])

  function rowsFor(id: TemplateId): ReportRow[] {
    if (id === 'agent_performance') {
      return (data?.byAgent ?? []).map(r => ({ agent_name: r.agent_name, all: r.all, inbound: r.inbound, outbound: r.outbound, apps: r.apps, funded: r.funded }))
    }
    if (id === 'disposition_summary') {
      const total = data?.totals.all ?? 0
      return (data?.byDisposition.all ?? []).map(r => ({ disposition: r.disposition, count: r.count, pct: pctString(r.count, total) }))
    }
    if (id === 'lead_pipeline') {
      return pipeline.map(r => ({
        lead_type: r.lead_type, total: r.total, dialable: r.dialable, pipeline: r.pipeline, dead: r.dead,
        statuses: statusBreakdown(r.by_status),
      }))
    }
    return funded
  }

  const columns = active ? TEMPLATE_COLUMNS[active] : []
  const activeRows = active ? rowsFor(active) : []
  const schedulesForActive = schedules.filter(s => s.template === active)
  const scopeNote = active === 'lead_pipeline'
    ? 'All time · all agents'
    : active === 'agent_performance'
      ? `${RANGE_LABELS[range]} · whole team`
      : `${RANGE_LABELS[range]} · ${filterAgentId ? filterAgentName : 'All Agents'}`

  async function toggleSchedule(s: ReportScheduleRow) {
    await fetch('/api/admin/report-schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, agent_id: agentId, enabled: !s.enabled }),
    }).catch(() => {})
    loadSchedules()
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this scheduled report?')) return
    await fetch(`/api/admin/report-schedules?id=${id}&agent_id=${agentId}`, { method: 'DELETE' }).catch(() => {})
    loadSchedules()
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-4 h-4 text-gray-400" />
        <h2 className="text-white font-semibold">Reports</h2>
        <span className="text-xs text-gray-500 ml-1">run on screen, export to CSV, or email on a schedule</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {TEMPLATE_IDS.map(id => {
          const activeCount = schedules.filter(s => s.template === id && s.enabled).length
          return (
            <button
              key={id}
              onClick={() => { setActive(prev => prev === id ? null : id); setShowSchedule(false) }}
              className={`bg-gray-800 rounded-xl border p-4 text-left transition-colors ${active === id ? 'border-cyan-500' : 'border-gray-700 hover:border-gray-500'}`}
            >
              <p className="text-white text-sm font-semibold">{TEMPLATE_LABELS[id]}</p>
              <p className="text-gray-500 text-xs mt-1">
                {activeCount ? `${activeCount} active schedule${activeCount === 1 ? '' : 's'}` : 'No schedules'}
              </p>
            </button>
          )
        })}
      </div>

      {active && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{TEMPLATE_LABELS[active]}</h3>
            <span className="text-xs text-gray-500">{scopeNote} · {activeRows.length} rows</span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => downloadCsv(`${active}-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(columns, activeRows))}
                disabled={activeRows.length === 0}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={() => setShowSchedule(v => !v)}
                className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Schedule
              </button>
            </div>
          </div>

          {showSchedule && (
            <div className="px-4">
              <ScheduleForm
                template={active}
                agentId={agentId}
                filterAgentId={filterAgentId}
                filterAgentName={filterAgentName}
                range={range}
                onCreated={() => { setShowSchedule(false); loadSchedules() }}
                onCancel={() => setShowSchedule(false)}
              />
            </div>
          )}

          {schedulesForActive.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-700 space-y-1.5">
              {schedulesForActive.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                  <span className="text-gray-300">{describeSchedule(s)}</span>
                  <span className="truncate flex-1 min-w-[120px]">→ {s.recipients.join(', ')}</span>
                  <button onClick={() => toggleSchedule(s)} className="text-gray-500 hover:text-white transition-colors shrink-0">
                    {s.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => deleteSchedule(s.id)} className="text-gray-500 hover:text-red-400 transition-colors shrink-0">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            {active === 'funded_deals' && fundedLoading ? (
              <p className="text-gray-500 text-sm p-4">Loading…</p>
            ) : active === 'funded_deals' && fundedError ? (
              <p className="text-red-400 text-sm p-4">{fundedError}</p>
            ) : activeRows.length === 0 ? (
              <p className="text-gray-600 text-sm p-4">No data for this range.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-gray-700">
                    {columns.map(c => <th key={c.key} className="text-left px-4 py-2 font-medium whitespace-nowrap">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {activeRows.map((row, i) => (
                    <tr key={i}>
                      {columns.map(c => (
                        <td key={c.key} className="px-4 py-2 text-gray-300 whitespace-nowrap">
                          {typeof row[c.key] === 'number' && (c.key === 'requested_amount' || c.key === 'revenue')
                            ? `$${(row[c.key] as number).toLocaleString()}`
                            : row[c.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
  const [openDetail, setOpenDetail] = useState<DetailKey | null>(null)
  const [pipeline, setPipeline] = useState<LeadSourceRow[]>([])
  const [pipelineLoading, setPipelineLoading] = useState(true)
  const [filterAgentId, setFilterAgentId] = useState('')
  const [allAgents, setAllAgents] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async (r: Range, agentId: string, filterAgent: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range: r, agent_id: agentId })
      if (filterAgent) params.set('filter_agent_id', filterAgent)
      const res = await fetch(`/api/admin/analytics?${params}`)
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    load(range, agent.id, filterAgentId)
    fetch(`/api/admin/lead-pipeline?agent_id=${agent.id}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPipeline(d) })
      .finally(() => setPipelineLoading(false))
    fetch(`/api/agents?agent_id=${agent.id}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setAllAgents(d.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))) })
      .catch(() => {})
  }, [agent, agentLoading, router, range, filterAgentId, load])

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
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <div className="flex items-center gap-3">
          <select
            value={filterAgentId}
            onChange={e => setFilterAgentId(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All Agents</option>
            {allAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
            {(Object.keys(RANGE_LABELS) as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  range === r ? 'neon-sweep bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
                style={range === r ? ({ '--glow-color': '#3b82f6' } as React.CSSProperties) : undefined}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
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

      {/* By Agent */}
      {!loading && data && data.byAgent.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-gray-400" />
            <h2 className="text-white font-semibold">By Agent</h2>
            <span className="text-xs text-gray-500 ml-1">{RANGE_LABELS[range]} · click a row to filter</span>
          </div>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="grid grid-cols-7 gap-2 px-4 py-2.5 border-b border-gray-700 text-gray-500 text-xs uppercase tracking-widest">
              <span className="col-span-2">Agent</span>
              <span className="text-right">Total</span>
              <span className="text-right">Inbound</span>
              <span className="text-right">Outbound</span>
              <span className="text-right">Apps</span>
              <span className="text-right">Funded</span>
            </div>
            <div className="divide-y divide-gray-700/50">
              {data.byAgent.map(row => (
                <button
                  key={row.agent_id}
                  onClick={() => setFilterAgentId(prev => prev === row.agent_id ? '' : row.agent_id)}
                  className={`grid grid-cols-7 gap-2 px-4 py-2.5 w-full text-left transition-colors ${
                    filterAgentId === row.agent_id ? 'bg-cyan-950/40' : 'hover:bg-gray-750'
                  }`}
                >
                  <span className="col-span-2 text-white text-sm font-medium truncate">{row.agent_name}</span>
                  <span className="text-gray-300 text-sm text-right">{row.all}</span>
                  <span className="text-green-400 text-sm text-right">{row.inbound}</span>
                  <span className="text-blue-400 text-sm text-right">{row.outbound}</span>
                  <span className="text-teal-400 text-sm text-right">{row.apps}</span>
                  <span className="text-emerald-400 text-sm text-right">{row.funded}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* Reports */}
      <ReportsSection
        data={data}
        pipeline={pipeline}
        range={range}
        filterAgentId={filterAgentId}
        filterAgentName={allAgents.find(a => a.id === filterAgentId)?.name || 'Selected agent'}
        agentId={agent.id}
      />

      {/* Detail modal */}
      {openDetail && (
        <DetailModal
          detailKey={openDetail}
          range={range}
          agentId={agent.id}
          filterAgentId={filterAgentId}
          onClose={() => setOpenDetail(null)}
        />
      )}
    </div>
  )
}
