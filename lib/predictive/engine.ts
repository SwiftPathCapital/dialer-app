import type { createServerClient } from '../supabase'
import { getConfigValue, getAppUrl } from '../telnyx'
import { telnyxRequest, encodeClientState } from '../telnyxApi'
import { getDialerSettings, type DialerSettings } from '../dialerSettings'
import { applyLeadFilters, COOLDOWN_MS } from '../leadQueue'
import { isCallableNow } from '../callingHours'
import { chooseCallerId, loadCallerIds, toE164 } from '../localPresence'
import { parseTelnyxPublicKey } from '../telnyxWebhook'
import { linesToDial, abandonRatePct, answerRateFrom, HUMAN_ANSWERED_STATUSES, FINISHED_STATUSES } from './pacing'

type Db = ReturnType<typeof createServerClient>

export const HEARTBEAT_STALE_MS = 20_000
const LEAD_RING_SECONDS = 25          // FTC TSR: let it ring at least 15 s / 4 rings
const MAX_DIALS_PER_TICK = 10
const IN_FLIGHT_WINDOW_MS = 2 * 60_000
export const CANCELLED_NO_AGENT = 'cancelled_no_agent'

export async function predictiveSetupProblems(): Promise<string[]> {
  const problems: string[] = []
  if (!(await getConfigValue('telnyx_call_control_connection_id'))) problems.push('Add the Telnyx Call Control connection ID under Admin → Config.')
  if (!parseTelnyxPublicKey(await getConfigValue('telnyx_public_key'))) problems.push('Add a valid Telnyx public key under Admin → Config (used to verify dialer webhooks).')
  return problems
}

async function dialerWebhookUrl() {
  return `${(await getAppUrl()).replace(/\/$/, '')}/api/webhooks/dialer`
}

export function abandonedMessage(settings: DialerSettings, tenantName: string): string {
  const name = settings.business_name || tenantName
  return `Hello, this is ${name}. Sorry we missed you. Please call us back at this number. Thank you.`
}

export async function hangupCall(callControlId: string | null | undefined) {
  if (!callControlId) return
  await telnyxRequest('POST', `/calls/${callControlId}/actions/hangup`, {}).catch(err => console.warn('[predictive] hangup failed', err.message))
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function tenantAbandonStats(db: Db, tenantId: string) {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const count = async (statuses: string[], sinceIso: string) => {
    const { count } = await db.from('dialer_dial_attempts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).in('status', statuses).gte('created_at', sinceIso)
    return count ?? 0
  }
  const [humanAnswered, abandoned, attempts] = await Promise.all([
    count(HUMAN_ANSWERED_STATUSES, since30d),
    count(['abandoned'], since30d),
    count(FINISHED_STATUSES, since30d),
  ])
  return { attempts30d: attempts, humanAnswered30d: humanAnswered, abandoned30d: abandoned, abandonRatePct: abandonRatePct(humanAnswered, abandoned) }
}

// ── Pacer ────────────────────────────────────────────────────────────────────

// Runs on every agent heartbeat and every dialer webhook. A short lease on the tenant's
// settings row makes concurrent triggers a no-op instead of double-dialing.
export async function pace(db: Db, tenantId: string): Promise<{ dialed: number; reason?: string }> {
  const nowIso = new Date().toISOString()
  const { data: lease } = await db
    .from('dialer_tenant_settings')
    .update({ pacer_locked_until: new Date(Date.now() + 5000).toISOString() })
    .eq('tenant_id', tenantId)
    .eq('predictive_enabled', true)
    .or(`pacer_locked_until.is.null,pacer_locked_until.lt.${nowIso}`)
    .select('tenant_id')
  if (!lease?.length) return { dialed: 0, reason: 'locked-or-disabled' }

  try {
    return await paceLocked(db, tenantId)
  } finally {
    await db.from('dialer_tenant_settings').update({ pacer_locked_until: null }).eq('tenant_id', tenantId)
  }
}

async function paceLocked(db: Db, tenantId: string): Promise<{ dialed: number; reason?: string }> {
  const connectionId = await getConfigValue('telnyx_call_control_connection_id')
  if (!connectionId) return { dialed: 0, reason: 'no-connection' }
  const settings = await getDialerSettings(db, tenantId)
  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString()

  // Agents whose browser stopped checking in: drop their connection so nobody is
  // connected to an empty seat.
  const { data: stale } = await db
    .from('dialer_agent_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .in('status', ['connecting', 'ready', 'wrapup'])
    .lt('last_heartbeat_at', staleCutoff)
    .select('agent_call_control_id')
  for (const s of stale ?? []) await hangupCall(s.agent_call_control_id)

  const { data: ready } = await db
    .from('dialer_agent_sessions')
    .select('id, agent_id, agents(did)')
    .eq('tenant_id', tenantId)
    .eq('status', 'ready')
    .not('conference_id', 'is', null)
    .gte('last_heartbeat_at', staleCutoff)
  const readyAgents = ready ?? []
  if (!readyAgents.length) {
    // Nobody can take a call: cancel anything still ringing rather than let it turn into an
    // abandoned call if someone picks up. (If one is answered in the instant before the
    // hangup lands, the webhook still connects it or plays the abandoned-call message.)
    const { data: ringing } = await db
      .from('dialer_dial_attempts')
      .update({ status: 'failed', hangup_cause: CANCELLED_NO_AGENT, ended_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('status', 'dialing')
      .select('call_control_id')
    for (const r of ringing ?? []) await hangupCall(r.call_control_id)
    return { dialed: 0, reason: 'no-ready-agents' }
  }

  const inFlightSince = new Date(Date.now() - IN_FLIGHT_WINDOW_MS).toISOString()
  const recentSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const [{ count: inFlight }, { data: recent }, stats] = await Promise.all([
    db.from('dialer_dial_attempts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).in('status', ['dialing', 'answered']).gte('created_at', inFlightSince),
    db.from('dialer_dial_attempts').select('status')
      .eq('tenant_id', tenantId).in('status', FINISHED_STATUSES).gte('created_at', recentSince)
      .order('created_at', { ascending: false }).limit(200),
    tenantAbandonStats(db, tenantId),
  ])

  const n = Math.min(MAX_DIALS_PER_TICK, linesToDial({
    readyAgents: readyAgents.length,
    inFlight: inFlight ?? 0,
    answerRate: answerRateFrom(recent ?? []),
    abandonRatePct: stats.abandonRatePct,
    abandonTargetPct: settings.predictive_abandon_target_pct,
    maxRatio: settings.predictive_max_ratio,
  }))
  if (n <= 0) return { dialed: 0, reason: 'paced' }

  const readyAgentIds = readyAgents.map(r => r.agent_id)
  // Order/limit must be set before applyLeadFilters: it's async, so awaiting it runs the query.
  const baseQuery = db.from('leads').select('id, phone, state, last_called_at')
    .order('last_called_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(n * 4)
  const { data: candidates } = await applyLeadFilters(db, baseQuery, { agentId: null, phone: '', search: '', tenantId, assignedToAnyOf: readyAgentIds })

  const callerIds = settings.local_presence_enabled ? await loadCallerIds(db, tenantId) : []
  const fallbackFrom = toE164((readyAgents[0].agents as unknown as { did: string | null } | null)?.did || '') || callerIds[0]?.phone_number || null
  const webhookUrl = await dialerWebhookUrl()

  let dialed = 0
  for (const lead of candidates ?? []) {
    if (dialed >= n) break
    const to = toE164(lead.phone || '')
    if (!to || !isCallableNow({ state: lead.state, phone: lead.phone }).ok) continue

    // Claim the lead by stamping last_called_at — only succeeds if nobody else (another
    // agent's manual dial, an overlapping pacer) has called it inside the cooldown.
    const cutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()
    const { data: claimed } = await db
      .from('leads')
      .update({ last_called_at: new Date().toISOString() })
      .eq('id', lead.id)
      .or(`last_called_at.is.null,last_called_at.lt.${cutoff}`)
      .select('id')
    if (!claimed?.length) continue

    const from = (settings.local_presence_enabled && chooseCallerId(callerIds, to, lead.state).number) || fallbackFrom
    if (!from) {
      await db.from('leads').update({ last_called_at: lead.last_called_at }).eq('id', lead.id)
      return { dialed, reason: 'no-caller-id' }
    }

    const { data: attempt } = await db
      .from('dialer_dial_attempts')
      .insert({ tenant_id: tenantId, lead_id: lead.id, phone: to, caller_id: from, status: 'dialing' })
      .select('id')
      .single()
    if (!attempt) continue

    try {
      const res = await telnyxRequest('POST', '/calls', {
        connection_id: connectionId,
        to,
        from,
        timeout_secs: LEAD_RING_SECONDS,
        answering_machine_detection: settings.predictive_amd_enabled ? 'detect' : 'disabled',
        client_state: encodeClientState({ k: 'lead', a: attempt.id }),
        webhook_url: webhookUrl,
      })
      await db.from('dialer_dial_attempts').update({ call_control_id: res?.data?.call_control_id ?? null }).eq('id', attempt.id)
      dialed++
    } catch (err) {
      console.error('[predictive] dial failed', err)
      await db.from('dialer_dial_attempts').update({ status: 'failed', ended_at: new Date().toISOString(), hangup_cause: 'dial_error' }).eq('id', attempt.id)
      // Don't burn the lead's cooldown on our own failure.
      await db.from('leads').update({ last_called_at: lead.last_called_at }).eq('id', lead.id)
    }
  }
  return { dialed }
}

// ── Webhook event handling ───────────────────────────────────────────────────

interface AttemptRow {
  id: string
  tenant_id: string
  lead_id: string | null
  phone: string
  caller_id: string | null
  call_control_id: string | null
  session_id: string | null
  dialer_call_id: string | null
  status: string
  connected_at: string | null
}

const ATTEMPT_COLUMNS = 'id, tenant_id, lead_id, phone, caller_id, call_control_id, session_id, dialer_call_id, status, connected_at'

export async function loadAttempt(db: Db, attemptId: string): Promise<AttemptRow | null> {
  const { data } = await db.from('dialer_dial_attempts').select(ATTEMPT_COLUMNS).eq('id', attemptId).maybeSingle()
  return (data as AttemptRow | null) ?? null
}

// A person answered (or AMD says "human"/"not sure"): connect them to the agent who has
// been waiting longest, or — if every agent got taken in the meantime — play the required
// abandoned-call message and hang up.
export async function connectOrAbandon(db: Db, attempt: AttemptRow, callControlId: string) {
  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString()
  const { data: candidates } = await db
    .from('dialer_agent_sessions')
    .select('id, agent_id, conference_id')
    .eq('tenant_id', attempt.tenant_id)
    .eq('status', 'ready')
    .not('conference_id', 'is', null)
    .gte('last_heartbeat_at', staleCutoff)
    .order('ready_since', { ascending: true })

  for (const s of candidates ?? []) {
    const { data: claimed } = await db
      .from('dialer_agent_sessions')
      .update({ status: 'on_call', current_attempt_id: attempt.id })
      .eq('id', s.id)
      .eq('status', 'ready')
      .select('id')
    if (!claimed?.length) continue

    try {
      await telnyxRequest('POST', `/conferences/${s.conference_id}/actions/join`, { call_control_id: callControlId })
    } catch (err) {
      console.error('[predictive] join failed', err)
      await db.from('dialer_agent_sessions').update({ status: 'ready', current_attempt_id: null }).eq('id', s.id)
      continue
    }

    const now = new Date().toISOString()
    const { data: callRow } = await db
      .from('dialer_calls')
      .insert({
        direction: 'outbound',
        from_number: attempt.caller_id,
        to_number: attempt.phone,
        agent_id: s.agent_id,
        lead_id: attempt.lead_id,
        tenant_id: attempt.tenant_id,
        status: 'active',
        started_at: now,
        telnyx_call_control_id: callControlId,
      })
      .select('id')
      .single()
    await db.from('dialer_dial_attempts')
      .update({ status: 'connected', session_id: s.id, connected_at: now, dialer_call_id: callRow?.id ?? null })
      .eq('id', attempt.id)

    const appUrl = (await getAppUrl()).replace(/\/$/, '')
    telnyxRequest('POST', `/calls/${callControlId}/actions/record_start`, {
      format: 'mp3', channels: 'dual', webhook_url: `${appUrl}/api/webhooks/voice/call-recording`,
    }).catch(err => console.warn('[predictive] record_start failed', err.message))
    return 'connected' as const
  }

  // Nobody free — abandoned. The message must start right away (TSR: within 2 seconds).
  await db.from('dialer_dial_attempts').update({ status: 'abandoned' }).eq('id', attempt.id)
  const [{ data: tenant }, settings] = await Promise.all([
    db.from('tenants').select('name').eq('id', attempt.tenant_id).maybeSingle(),
    getDialerSettings(db, attempt.tenant_id),
  ])
  try {
    await telnyxRequest('POST', `/calls/${callControlId}/actions/speak`, {
      payload: abandonedMessage(settings, tenant?.name || 'our office'),
      voice: 'female',
      language: 'en-US',
    })
  } catch (err) {
    console.error('[predictive] abandoned-message speak failed — hanging up', err)
    await hangupCall(callControlId)
  }
  return 'abandoned' as const
}

export function attemptStatusForHangup(prevStatus: string, cause: string | null | undefined): string | null {
  if (prevStatus === 'dialing') {
    if (cause === 'user_busy') return 'busy'
    if (cause === 'timeout' || cause === 'originator_cancel' || cause === 'no_answer' || cause === 'normal_clearing') return 'no_answer'
    return 'failed'
  }
  if (prevStatus === 'answered') return 'ended'
  return null // connected / abandoned / machine keep their status
}
