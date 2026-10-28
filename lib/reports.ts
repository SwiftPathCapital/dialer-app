import type { createServerClient } from '@/lib/supabase'

type Db = ReturnType<typeof createServerClient>

export interface ReportColumn { key: string; label: string }
export type ReportRow = Record<string, string | number | null>
export interface ReportResult { columns: ReportColumn[]; rows: ReportRow[] }
export interface ReportFilters { range?: string; filter_agent_id?: string }

export type TemplateId = 'agent_performance' | 'disposition_summary' | 'lead_pipeline' | 'funded_deals'

export const TEMPLATE_IDS: TemplateId[] = ['agent_performance', 'disposition_summary', 'lead_pipeline', 'funded_deals']

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  agent_performance: 'Agent Performance',
  disposition_summary: 'Disposition Summary',
  lead_pipeline: 'Lead Pipeline by Source',
  funded_deals: 'Funded Deals',
}

export const TEMPLATE_COLUMNS: Record<TemplateId, ReportColumn[]> = {
  agent_performance: [
    { key: 'agent_name', label: 'Agent' },
    { key: 'all', label: 'Total' },
    { key: 'inbound', label: 'Inbound' },
    { key: 'outbound', label: 'Outbound' },
    { key: 'apps', label: 'Apps' },
    { key: 'funded', label: 'Funded' },
  ],
  disposition_summary: [
    { key: 'disposition', label: 'Disposition' },
    { key: 'count', label: 'Count' },
    { key: 'pct', label: '% of Total' },
  ],
  lead_pipeline: [
    { key: 'lead_type', label: 'Lead Type' },
    { key: 'total', label: 'Total' },
    { key: 'dialable', label: 'Dialable' },
    { key: 'pipeline', label: 'In Pipeline' },
    { key: 'dead', label: 'Dead' },
    { key: 'statuses', label: 'Status Breakdown' },
  ],
  funded_deals: [
    { key: 'date', label: 'Date' },
    { key: 'agent', label: 'Agent' },
    { key: 'company', label: 'Company / Lead' },
    { key: 'phone', label: 'Phone' },
    { key: 'requested_amount', label: 'Requested Amount' },
    { key: 'revenue', label: 'Revenue' },
  ],
}

// Must match rangeStart() in app/api/admin/analytics/route.ts — the on-screen reports
// read from that endpoint, scheduled ones query here, and both must cover the same window.
function rangeStart(range?: string): string {
  const now = new Date()
  if (range === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString()
  }
  if (range === 'week') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  if (range === 'month') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  return '1970-01-01T00:00:00.000Z'
}

const APP_DISPOS = ['App Received', 'App Signed']
const FUNDED_DISPOS = ['Deal Funded']
// Must match app/api/admin/lead-pipeline/route.ts
const DEAD_STATUSES = new Set(['DNC', 'Not Interested', 'Wrong Number'])
const PIPELINE_STATUSES = new Set(['App Received', 'Docs Received', 'Pending App & Docs', 'Deal Funded'])

export function pctString(count: number, total: number): string {
  return total ? `${Math.round((count / total) * 100)}%` : '0%'
}

export function statusBreakdown(byStatus: Record<string, number>): string {
  return Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s}: ${c}`).join('; ')
}

async function agentPerformance(db: Db, tenantId: string, filters: ReportFilters): Promise<ReportRow[]> {
  const { data, error } = await db
    .from('dialer_calls')
    .select('direction, disposition, agent_id, agents(name)')
    .eq('tenant_id', tenantId)
    .gte('started_at', rangeStart(filters.range))
    .not('telnyx_call_control_id', 'is', null)
  if (error) throw new Error(error.message)

  const map = new Map<string, { agent_name: string; all: number; inbound: number; outbound: number; apps: number; funded: number }>()
  for (const c of data ?? []) {
    if (!c.agent_id) continue
    const name = (c.agents as unknown as { name: string } | null)?.name || 'Unknown'
    const row = map.get(c.agent_id) || { agent_name: name, all: 0, inbound: 0, outbound: 0, apps: 0, funded: 0 }
    row.all++
    if (c.direction === 'inbound') row.inbound++
    if (c.direction === 'outbound') row.outbound++
    if (c.disposition && APP_DISPOS.includes(c.disposition)) row.apps++
    if (c.disposition && FUNDED_DISPOS.includes(c.disposition)) row.funded++
    map.set(c.agent_id, row)
  }
  return Array.from(map.values()).sort((a, b) => b.all - a.all)
}

async function dispositionSummary(db: Db, tenantId: string, filters: ReportFilters): Promise<ReportRow[]> {
  let query = db
    .from('dialer_calls')
    .select('disposition, agent_id')
    .eq('tenant_id', tenantId)
    .gte('started_at', rangeStart(filters.range))
    .not('telnyx_call_control_id', 'is', null)
  if (filters.filter_agent_id) query = query.eq('agent_id', filters.filter_agent_id)
  const { data, error } = await query
  if (error) throw new Error(error.message)

  // Denominator is all calls (including undispositioned), matching the on-screen tables.
  const total = data?.length ?? 0
  const counts: Record<string, number> = {}
  for (const c of data ?? []) {
    if (!c.disposition) continue
    counts[c.disposition] = (counts[c.disposition] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([disposition, count]) => ({ disposition, count, pct: pctString(count, total) }))
}

async function leadPipelineBySource(db: Db, tenantId: string): Promise<ReportRow[]> {
  const { data, error } = await db.from('leads').select('lead_type, status').eq('tenant_id', tenantId)
  if (error) throw new Error(error.message)

  const map = new Map<string, { lead_type: string; total: number; dialable: number; pipeline: number; dead: number; by_status: Record<string, number> }>()
  for (const row of data ?? []) {
    const key = row.lead_type || 'Unknown'
    const entry = map.get(key) || { lead_type: key, total: 0, dialable: 0, pipeline: 0, dead: 0, by_status: {} as Record<string, number> }
    const status = row.status || 'New'
    entry.total++
    entry.by_status[status] = (entry.by_status[status] || 0) + 1
    if (DEAD_STATUSES.has(status)) entry.dead++
    else if (PIPELINE_STATUSES.has(status)) entry.pipeline++
    else entry.dialable++
    map.set(key, entry)
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .map(({ by_status, ...rest }) => ({ ...rest, statuses: statusBreakdown(by_status) }))
}

interface FundedLeadJoin {
  company_name: string | null
  name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  requested_amount: number | null
  revenue: number | null
}

export async function fetchFundedDeals(db: Db, tenantId: string, filters: ReportFilters): Promise<ReportRow[]> {
  let query = db
    .from('dialer_calls')
    .select('started_at, direction, from_number, to_number, agent_id, agents(name), leads(company_name, name, first_name, last_name, phone, requested_amount, revenue)')
    .eq('tenant_id', tenantId)
    .in('disposition', FUNDED_DISPOS)
    .gte('started_at', rangeStart(filters.range))
    .not('telnyx_call_control_id', 'is', null)
    .order('started_at', { ascending: false })
  if (filters.filter_agent_id) query = query.eq('agent_id', filters.filter_agent_id)
  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map(c => {
    const lead = c.leads as unknown as FundedLeadJoin | null
    const agentName = (c.agents as unknown as { name: string } | null)?.name || 'Unknown'
    const company = lead?.company_name || [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || lead?.name || 'Unknown'
    const callNumber = c.direction === 'inbound' ? c.from_number : c.to_number
    return {
      date: c.started_at.slice(0, 10),
      agent: agentName,
      company,
      phone: lead?.phone || callNumber || '',
      requested_amount: lead?.requested_amount ?? null,
      revenue: lead?.revenue ?? null,
    }
  })
}

export async function runTemplate(db: Db, tenantId: string, template: TemplateId, filters: ReportFilters): Promise<ReportResult> {
  let rows: ReportRow[]
  switch (template) {
    case 'agent_performance': rows = await agentPerformance(db, tenantId, filters); break
    case 'disposition_summary': rows = await dispositionSummary(db, tenantId, filters); break
    case 'lead_pipeline': rows = await leadPipelineBySource(db, tenantId); break
    case 'funded_deals': rows = await fetchFundedDeals(db, tenantId, filters); break
    default: throw new Error(`Unknown report template: ${template}`)
  }
  return { columns: TEMPLATE_COLUMNS[template], rows }
}

export function rowsToCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map(c => esc(c.label)).join(',')
  const body = rows.map(r => columns.map(c => esc(r[c.key])).join(',')).join('\n')
  return `${header}\n${body}`
}

function escapeHtml(v: string | number | null | undefined): string {
  if (v == null) return ''
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function rowsToHtmlTable(columns: ReportColumn[], rows: ReportRow[]): string {
  const th = columns.map(c => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333;">${escapeHtml(c.label)}</th>`).join('')
  const trs = rows.map(r => `<tr>${columns.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #ddd;">${escapeHtml(r[c.key])}</td>`).join('')}</tr>`).join('')
  return `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

export interface ReportSchedule {
  frequency: string
  hour_utc: number
  day_of_week: number | null
  day_of_month: number | null
  last_sent_at: string | null
}

// The dispatch cron runs hourly. A schedule is due when the current UTC hour matches
// hour_utc (and, for weekly/monthly, the day also matches) and it hasn't already been
// attempted today — dispatch stamps last_sent_at whether or not the send succeeds, so a
// broken email provider doesn't make a schedule retry every hour.
export function dueNow(schedule: ReportSchedule, now = new Date()): boolean {
  if (now.getUTCHours() !== schedule.hour_utc) return false
  if (schedule.frequency === 'weekly' && now.getUTCDay() !== schedule.day_of_week) return false
  if (schedule.frequency === 'monthly' && now.getUTCDate() !== schedule.day_of_month) return false

  if (!schedule.last_sent_at) return true
  const last = new Date(schedule.last_sent_at)
  return last.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)
}
