'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin, PhoneForwarded, Zap, Radar, Check, Plus, Trash2, AlertTriangle, Search, ShoppingCart } from 'lucide-react'
import type { DialerSettings } from '@/lib/dialerSettings'
import { STATE_TIMEZONES } from '@/lib/callingHours'

interface CallerIdRow {
  id: string
  phone_number: string
  area_code: string
  state: string | null
  label: string | null
  enabled: boolean
  sms_enabled: boolean
  callback_mode: 'last_agent' | 'group' | null
  callback_group_id: string | null
}

interface Coverage { area_code: number; state: number; none: number; total: number }

interface PredictiveStats {
  attempts30d: number
  humanAnswered30d: number
  abandoned30d: number
  abandonRatePct: number
  readyAgents: number
  onCall: number
}

const STATES = Object.keys(STATE_TIMEZONES).sort()

const cardCls = 'bg-gray-800 rounded-xl border border-gray-700 p-5'
const inputCls = 'bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'
const labelCls = 'text-gray-500 text-[10px] uppercase tracking-widest block mb-1'

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 ${on ? 'bg-cyan-600' : 'bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

export default function DialerSettingsPanel({ agentId, tenantId, tenantName }: { agentId: string; tenantId?: string; tenantName?: string }) {
  const [settings, setSettings] = useState<DialerSettings | null>(null)
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [predictiveProblems, setPredictiveProblems] = useState<string[]>([])
  const [numbers, setNumbers] = useState<CallerIdRow[]>([])
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [stats, setStats] = useState<PredictiveStats | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showAssign, setShowAssign] = useState(false)

  const qs = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ agent_id: agentId, ...(tenantId ? { tenant_id: tenantId } : {}), ...extra })
    return p.toString()
  }, [agentId, tenantId])

  const loadNumbers = useCallback(() => {
    fetch(`/api/dialer/caller-ids?${qs()}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.numbers)) { setNumbers(d.numbers); setCoverage(d.coverage) } })
      .catch(() => {})
  }, [qs])

  useEffect(() => {
    fetch(`/api/dialer/settings?${qs()}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Could not load settings')
        setSettings(d.settings)
        setGroups(d.groups ?? [])
        setIsPlatformAdmin(!!d.isPlatformAdmin)
        setPredictiveProblems(Array.isArray(d.predictiveProblems) ? d.predictiveProblems : [])
      })
      .catch(err => setError(err.message))
  }, [qs])

  useEffect(() => { if (settings?.local_presence_enabled) loadNumbers() }, [settings?.local_presence_enabled, loadNumbers])

  useEffect(() => {
    if (!settings?.predictive_enabled) return
    fetch(`/api/dialer/predictive/stats?${qs()}`).then(r => r.json()).then(d => { if (d && typeof d.attempts30d === 'number') setStats(d) }).catch(() => {})
  }, [settings?.predictive_enabled, qs])

  async function save(patch: Partial<DialerSettings>) {
    if (!settings) return
    setError('')
    const prev = settings
    setSettings({ ...settings, ...patch })
    const res = await fetch('/api/dialer/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, ...(tenantId ? { tenant_id: tenantId } : {}), ...patch }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    if (!res?.ok) { setSettings(prev); setError(d?.error || 'Could not save'); return }
    setSettings(d.settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function patchNumber(id: string, patch: Partial<CallerIdRow>) {
    setError('')
    setNumbers(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n))
    const res = await fetch('/api/dialer/caller-ids', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, ...(tenantId ? { tenant_id: tenantId } : {}), id, ...patch }),
    }).catch(() => null)
    if (!res?.ok) {
      const d = await res?.json().catch(() => null)
      setError(d?.error || 'Could not update number')
      loadNumbers()
    } else if ('enabled' in patch) {
      loadNumbers()
    }
  }

  if (error && !settings) return <p className="text-red-400 text-sm">{error}</p>
  if (!settings) return <p className="text-gray-500 text-sm">Loading…</p>

  const addOns: { key: keyof DialerSettings; label: string; desc: string }[] = [
    { key: 'local_presence_enabled', label: 'Local presence', desc: 'Call each lead from a number in their area code or state.' },
    { key: 'local_presence_sms_enabled', label: 'Texting from local numbers', desc: 'Add-on: new text threads start from the lead\'s local number.' },
    { key: 'power_dialer_enabled', label: 'Power dialer', desc: 'Auto-dials the next lead after each disposition, one line per agent.' },
    { key: 'predictive_enabled', label: 'Predictive dialer', desc: 'Dials several leads per available agent and connects whoever answers.' },
  ]

  const callbackGroupName = (id: string | null) => groups.find(g => g.id === id)?.name

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {saved && <p className="text-green-400 text-xs flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</p>}

      {/* Add-ons */}
      <div className={cardCls}>
        <p className="text-white font-semibold text-sm mb-1">Dialer add-ons{tenantName ? ` — ${tenantName}` : ''}</p>
        <p className="text-gray-500 text-xs mb-4">
          {isPlatformAdmin ? 'Turn features on or off for this client.' : 'Your account manager turns these on for your account.'}
        </p>
        <div className="space-y-3">
          {addOns.map(a => (
            <div key={a.key} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-gray-200 text-sm">{a.label}</p>
                <p className="text-gray-500 text-xs">{a.desc}</p>
              </div>
              {isPlatformAdmin
                ? <Toggle on={!!settings[a.key]} onChange={v => save({ [a.key]: v } as Partial<DialerSettings>)} disabled={a.key === 'local_presence_sms_enabled' && !settings.local_presence_enabled} />
                : <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${settings[a.key] ? 'bg-cyan-900/60 text-cyan-300' : 'bg-gray-700 text-gray-400'}`}>{settings[a.key] ? 'On' : 'Off'}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Local presence */}
      {settings.local_presence_enabled && (
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <p className="text-white font-semibold text-sm">Local presence numbers</p>
            {isPlatformAdmin && (
              <button onClick={() => setShowAssign(v => !v)} className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-medium rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> Assign numbers
              </button>
            )}
          </div>
          <p className="text-gray-500 text-xs mb-4">
            Each lead is called from a number in their area code, or failing that their state. Otherwise the agent&apos;s own number is used. A lead always sees the same number.
          </p>

          {coverage && coverage.total > 0 && (
            <div className="mb-4">
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-700">
                <div className="bg-cyan-500" style={{ width: `${(coverage.area_code / coverage.total) * 100}%` }} />
                <div className="bg-indigo-500" style={{ width: `${(coverage.state / coverage.total) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                <span className="text-cyan-300">{coverage.area_code.toLocaleString()} same area code</span>
                <span className="text-indigo-300">{coverage.state.toLocaleString()} same state</span>
                <span className="text-gray-400">{coverage.none.toLocaleString()} agent&apos;s own number</span>
                <span className="text-gray-600">of {coverage.total.toLocaleString()} dialable leads</span>
              </div>
            </div>
          )}

          {showAssign && isPlatformAdmin && tenantId && (
            <AssignNumbers tenantId={tenantId} onChanged={loadNumbers} />
          )}

          {numbers.length === 0 ? (
            <p className="text-gray-600 text-sm">{isPlatformAdmin ? 'No numbers assigned yet — use Assign numbers.' : 'No numbers assigned yet — your account manager adds these.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[10px] uppercase tracking-widest border-b border-gray-700">
                    <th className="text-left py-2 pr-3 font-medium">Number</th>
                    <th className="text-left py-2 pr-3 font-medium">State</th>
                    <th className="text-left py-2 pr-3 font-medium">Label</th>
                    <th className="text-left py-2 pr-3 font-medium">Callbacks go to</th>
                    {settings.local_presence_sms_enabled && <th className="text-left py-2 pr-3 font-medium">Texting</th>}
                    <th className="text-left py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {numbers.map(n => (
                    <tr key={n.id} className={n.enabled ? '' : 'opacity-50'}>
                      <td className="py-2 pr-3 text-gray-200 whitespace-nowrap">{formatPhone(n.phone_number)}</td>
                      <td className="py-2 pr-3">
                        <select value={n.state ?? ''} onChange={e => patchNumber(n.id, { state: e.target.value || null })} className={`${inputCls} py-1 text-xs`}>
                          <option value="">—</option>
                          {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          defaultValue={n.label ?? ''}
                          onBlur={e => { if ((e.target.value || null) !== n.label) patchNumber(n.id, { label: e.target.value || null }) }}
                          placeholder="optional"
                          className={`${inputCls} py-1 text-xs w-32`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={n.callback_mode === 'group' ? `group:${n.callback_group_id ?? ''}` : n.callback_mode ?? ''}
                          onChange={e => {
                            const v = e.target.value
                            if (v === '') patchNumber(n.id, { callback_mode: null, callback_group_id: null })
                            else if (v === 'last_agent') patchNumber(n.id, { callback_mode: 'last_agent', callback_group_id: null })
                            else patchNumber(n.id, { callback_mode: 'group', callback_group_id: v.slice(6) || null })
                          }}
                          className={`${inputCls} py-1 text-xs`}
                        >
                          <option value="">Account default</option>
                          <option value="last_agent">Agent who last called</option>
                          {groups.map(g => <option key={g.id} value={`group:${g.id}`}>Group: {g.name}</option>)}
                        </select>
                      </td>
                      {settings.local_presence_sms_enabled && (
                        <td className="py-2 pr-3"><Toggle on={n.sms_enabled} onChange={v => patchNumber(n.id, { sms_enabled: v })} /></td>
                      )}
                      <td className="py-2"><Toggle on={n.enabled} onChange={v => patchNumber(n.id, { enabled: v })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {settings.local_presence_sms_enabled && (
            <p className="text-amber-400/80 text-[11px] mt-3">
              Each number used for texting must be on your registered 10DLC campaign in Telnyx, or carriers will block the messages.
            </p>
          )}
        </div>
      )}

      {/* Callback routing */}
      {settings.local_presence_enabled && (
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-1">
            <PhoneForwarded className="w-4 h-4 text-cyan-400" />
            <p className="text-white font-semibold text-sm">When a lead calls a local number back</p>
          </div>
          <p className="text-gray-500 text-xs mb-4">Account default. You can override it per number above.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input type="radio" checked={settings.callback_mode === 'last_agent'} onChange={() => save({ callback_mode: 'last_agent' })} />
              Ring the agent who last called them
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input type="radio" checked={settings.callback_mode === 'group'} onChange={() => save({ callback_mode: 'group', callback_group_id: settings.callback_group_id ?? groups[0]?.id ?? null })} />
              Ring a group
            </label>
          </div>
          <div className="mt-3">
            <label className={labelCls}>{settings.callback_mode === 'group' ? 'Group' : 'If we can\'t tell who called them, ring'}</label>
            <select value={settings.callback_group_id ?? ''} onChange={e => save({ callback_group_id: e.target.value || null })} className={inputCls}>
              <option value="">{settings.callback_mode === 'group' ? 'Choose a group…' : 'The account admin'}</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {settings.callback_mode === 'group' && !settings.callback_group_id && (
              <p className="text-amber-400 text-xs mt-1">Pick a group, or callbacks will ring the account admin.</p>
            )}
            {groups.length === 0 && <p className="text-gray-600 text-xs mt-1">No groups yet — create one under Admin → Groups.</p>}
          </div>
          {settings.callback_mode === 'last_agent' && (
            <p className="text-gray-600 text-xs mt-3">
              If that agent is offline the caller goes to their voicemail{settings.callback_group_id ? `; unknown callers ring ${callbackGroupName(settings.callback_group_id)}` : ''}.
            </p>
          )}
        </div>
      )}

      {/* Power dialer */}
      {(settings.power_dialer_enabled || settings.predictive_enabled) && (
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-cyan-400" />
            <p className="text-white font-semibold text-sm">Wrap-up time</p>
          </div>
          <p className="text-gray-500 text-xs mb-3">How long after a disposition before the next call goes out. Agents can pause or dial early.</p>
          <select value={settings.wrap_up_seconds} onChange={e => save({ wrap_up_seconds: Number(e.target.value) })} className={inputCls}>
            {[0, 5, 10, 15, 20, 30, 45, 60, 90, 120].map(s => <option key={s} value={s}>{s === 0 ? 'Immediately' : `${s} seconds`}</option>)}
          </select>
        </div>
      )}

      {/* Predictive */}
      {settings.predictive_enabled && (
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-1">
            <Radar className="w-4 h-4 text-cyan-400" />
            <p className="text-white font-semibold text-sm">Predictive dialer</p>
          </div>
          {predictiveProblems.length > 0 && (
            <div className="text-amber-400 text-xs mb-3 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p>Not set up yet, so agents can&apos;t start a predictive session:</p>
                <ul className="list-disc ml-4 mt-1">{predictiveProblems.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat label="Abandon rate (30 days)" value={`${stats.abandonRatePct.toFixed(1)}%`} warn={stats.abandonRatePct >= settings.predictive_abandon_target_pct} />
              <Stat label="Answered by a person" value={stats.humanAnswered30d.toLocaleString()} />
              <Stat label="Abandoned" value={stats.abandoned30d.toLocaleString()} />
              <Stat label="Agents ready / on call" value={`${stats.readyAgents} / ${stats.onCall}`} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Business name in the missed-call message</label>
              <input
                defaultValue={settings.business_name ?? ''}
                onBlur={e => { if ((e.target.value.trim() || null) !== settings.business_name) save({ business_name: e.target.value }) }}
                placeholder={tenantName || 'Your business name'}
                className={`${inputCls} w-full`}
              />
              <p className="text-gray-600 text-[11px] mt-1">
                If someone answers and no agent is free, they hear: &ldquo;Hello, this is {settings.business_name || tenantName || 'your business'}. Sorry we missed you. Please call us back at&rdquo; followed by the number that called them, read out twice. Callbacks to that number follow your callback routing.
              </p>
            </div>
            <div>
              <label className={labelCls}>Max lines per ready agent</label>
              <select value={settings.predictive_max_ratio} onChange={e => save({ predictive_max_ratio: Number(e.target.value) })} className={inputCls}>
                {[1, 1.5, 2, 2.5, 3].map(r => <option key={r} value={r}>{r === 1 ? '1 (no overdialing)' : `${r}`}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Abandon-rate target (30 days)</label>
              <select value={settings.predictive_abandon_target_pct} onChange={e => save({ predictive_abandon_target_pct: Number(e.target.value) })} className={inputCls}>
                {[1, 1.5, 2, 2.5, 3].map(p => <option key={p} value={p}>{p}%{p === 3 ? ' (legal limit)' : ''}</option>)}
              </select>
              <p className="text-gray-600 text-[11px] mt-1">At or above this, the dialer drops to one line per agent until the rate comes back down.</p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-gray-200 text-sm">Answering-machine detection</p>
                <p className="text-gray-500 text-xs">Hangs up on voicemail instead of connecting the agent. Adds a short delay; a misread counts as an abandoned call. No voicemail is left.</p>
              </div>
              <Toggle on={settings.predictive_amd_enabled} onChange={v => save({ predictive_amd_enabled: v })} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-gray-900 rounded-lg px-3 py-2 border border-gray-700">
      <p className="text-gray-500 text-[10px] uppercase tracking-widest">{label}</p>
      <p className={`text-lg font-semibold ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}

interface TelnyxNumberRow {
  telnyx_number_id: string
  phone_number: string
  area_code: string | null
  connection_name: string | null
  messaging_profile_name: string | null
  voice_ok: boolean
  sms_ok: boolean
  local_presence: { id: string; tenant_id: string; tenant_name: string } | null
  used_as: string | null
}

function AssignNumbers({ tenantId, onChanged }: { tenantId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<TelnyxNumberRow[] | null>(null)
  const [expected, setExpected] = useState<{ connection_name: string | null; messaging_profile_name: string | null }>({ connection_name: null, messaging_profile_name: null })
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [stateFor, setStateFor] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/platform/caller-ids')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Could not load Telnyx numbers')
        setRows(d.numbers)
        setExpected(d.expected)
      })
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => { load() }, [load])

  async function assign(row: TelnyxNumberRow) {
    setBusy(row.telnyx_number_id)
    setError('')
    const res = await fetch('/api/platform/caller-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, phone_number: row.phone_number, telnyx_number_id: row.telnyx_number_id, state: stateFor[row.telnyx_number_id] || null }),
    }).catch(() => null)
    setBusy(null)
    if (!res?.ok) { const d = await res?.json().catch(() => null); setError(d?.error || 'Could not assign'); return }
    load()
    onChanged()
  }

  async function unassign(row: TelnyxNumberRow) {
    if (!row.local_presence || !confirm(`Remove ${formatPhone(row.phone_number)} from ${row.local_presence.tenant_name}?`)) return
    setBusy(row.telnyx_number_id)
    await fetch(`/api/platform/caller-ids?id=${row.local_presence.id}`, { method: 'DELETE' }).catch(() => {})
    setBusy(null)
    load()
    onChanged()
  }

  const visible = (rows ?? []).filter(r => !filter || r.phone_number.includes(filter.replace(/\D/g, '')))

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <p className="text-gray-300 text-sm font-medium">Numbers on your Telnyx account</p>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by digits / area code" className={`${inputCls} py-1 text-xs ml-auto`} />
      </div>
      {expected.connection_name && (
        <p className="text-gray-500 text-[11px] mb-3">
          Callbacks only reach the dialer if the number is on voice connection <span className="text-gray-300">{expected.connection_name}</span>
          {expected.messaging_profile_name && <> and texts need messaging profile <span className="text-gray-300">{expected.messaging_profile_name}</span></>}. Change these in the Telnyx portal if a number is flagged.
        </p>
      )}
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
      {!rows ? <p className="text-gray-500 text-xs">Loading…</p> : (
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
          {visible.map(r => (
            <div key={r.telnyx_number_id} className="flex items-center gap-3 py-2 text-xs flex-wrap">
              <span className="text-gray-200 w-32">{formatPhone(r.phone_number)}</span>
              <span className="flex-1 min-w-[140px] text-gray-500">
                {r.used_as ?? (r.local_presence ? `Local presence: ${r.local_presence.tenant_name}` : 'Unassigned')}
                {!r.voice_ok && <span className="text-amber-400"> · callbacks won&apos;t reach the dialer</span>}
                {!r.sms_ok && <span className="text-amber-400"> · texts won&apos;t reach the dialer</span>}
              </span>
              {r.local_presence ? (
                <button onClick={() => unassign(r)} disabled={busy === r.telnyx_number_id} className="flex items-center gap-1 text-gray-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              ) : !r.used_as ? (
                <>
                  <select value={stateFor[r.telnyx_number_id] ?? ''} onChange={e => setStateFor(p => ({ ...p, [r.telnyx_number_id]: e.target.value }))} className={`${inputCls} py-1 text-xs`}>
                    <option value="">State…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => assign(r)} disabled={busy === r.telnyx_number_id} className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-md transition-colors">
                    Assign
                  </button>
                </>
              ) : null}
            </div>
          ))}
          {visible.length === 0 && <p className="text-gray-600 py-2">No numbers match.</p>}
        </div>
      )}
      <BuyNumber tenantId={tenantId} onBought={() => { load(); onChanged() }} />
    </div>
  )
}

interface AvailableNumberRow { phone_number: string; state: string | null; city: string | null; monthly_cost: string | null; upfront_cost: string | null; currency: string; sms: boolean }

const money = (v: string | null, currency: string) => v == null ? '?' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(v))

// Buys a new number on the shared Telnyx account for this client. Real money: every purchase
// shows its price and asks first; the server also refuses an unconfirmed request.
function BuyNumber({ tenantId, onBought }: { tenantId: string; onBought: () => void }) {
  const [areaCode, setAreaCode] = useState('')
  const [state, setState] = useState('')
  const [results, setResults] = useState<AvailableNumberRow[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [buying, setBuying] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setSearching(true); setMessage(null); setResults(null)
    const q = new URLSearchParams()
    if (areaCode.trim()) q.set('area_code', areaCode.trim())
    if (state) q.set('state', state)
    const res = await fetch(`/api/platform/numbers?${q}`).catch(() => null)
    const d = await res?.json().catch(() => null)
    setSearching(false)
    if (!res?.ok) { setMessage({ kind: 'error', text: d?.error || 'Search failed' }); return }
    setResults(d.numbers)
  }

  async function buy(n: AvailableNumberRow) {
    const price = `${money(n.monthly_cost, n.currency)}/month${n.upfront_cost && Number(n.upfront_cost) > 0 ? ` + ${money(n.upfront_cost, n.currency)} now` : ''}`
    if (!confirm(`Buy ${formatPhone(n.phone_number)} for ${price} on your Telnyx account and assign it to this client?\n\nTelnyx bills this to your account.`)) return
    setBuying(n.phone_number); setMessage(null)
    const res = await fetch('/api/platform/numbers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: n.phone_number, tenant_id: tenantId, state: n.state, confirm: true }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setBuying(null)
    if (!res?.ok) { setMessage({ kind: 'error', text: d?.error || 'Purchase failed' }); return }
    setResults(r => r?.filter(x => x.phone_number !== n.phone_number) ?? null)
    setMessage(d.warning ? { kind: 'error', text: d.warning } : { kind: 'ok', text: `Bought ${formatPhone(n.phone_number)} and assigned it.${d.order_status === 'pending' ? ' Telnyx is still activating it; it may take a few minutes to ring.' : ''}` })
    onBought()
  }

  return (
    <div className="mt-4 border-t border-gray-800 pt-3">
      <p className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-cyan-400" /> Buy a new number</p>
      <form onSubmit={search} className="flex items-center gap-2 flex-wrap mb-2">
        <input value={areaCode} onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Area code" inputMode="numeric" className={`${inputCls} py-1 text-xs w-24`} />
        <span className="text-gray-600 text-xs">or</span>
        <select value={state} onChange={e => setState(e.target.value)} className={`${inputCls} py-1 text-xs`}>
          <option value="">State…</option>
          {STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" disabled={searching || (!areaCode && !state)} className="flex items-center gap-1 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded-md transition-colors">
          <Search className="w-3.5 h-3.5" /> {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {message && <p className={`text-xs mb-2 ${message.kind === 'error' ? 'text-red-400' : 'text-green-400'}`}>{message.text}</p>}
      {results && (results.length === 0 ? <p className="text-gray-600 text-xs">Telnyx has no numbers for sale there right now.</p> : (
        <div className="max-h-60 overflow-y-auto divide-y divide-gray-800">
          {results.map(n => (
            <div key={n.phone_number} className="flex items-center gap-3 py-2 text-xs">
              <span className="text-gray-200 w-32">{formatPhone(n.phone_number)}</span>
              <span className="flex-1 text-gray-500">{[n.city, n.state].filter(Boolean).join(', ')}{!n.sms && <span className="text-amber-400"> · no texting</span>}</span>
              <span className="text-gray-400">{money(n.monthly_cost, n.currency)}/mo</span>
              <button onClick={() => buy(n)} disabled={!!buying} className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white rounded-md transition-colors">
                {buying === n.phone_number ? 'Buying…' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      ))}
      <p className="text-gray-600 text-[11px] mt-2">New numbers go on the same voice connection and messaging profile as your current lines. Texting from them still needs them added to your 10DLC campaign in Telnyx.</p>
    </div>
  )
}
