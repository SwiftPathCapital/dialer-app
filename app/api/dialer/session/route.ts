import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized, switchedAccount } from '@/lib/caller'
import { getConfigValue } from '@/lib/telnyx'
import { telnyxRequest, encodeClientState } from '@/lib/telnyxApi'
import { getDialerSettings } from '@/lib/dialerSettings'
import { toE164 } from '@/lib/localPresence'
import { pace, predictiveSetupProblems, hangupCall, loadAttempt, HEARTBEAT_STALE_MS } from '@/lib/predictive/engine'
import { getAppUrl } from '@/lib/telnyx'

// The predictive session for one agent. The browser polls GET every ~2 s while a session
// is open; that poll is the heartbeat (a closed tab stops dialing within ~20 s) and also
// drives the pacer.

const SESSION_COLUMNS = 'id, tenant_id, agent_id, status, agent_call_control_id, conference_id, current_attempt_id, ready_since, started_at'
const LEAD_COLUMNS = 'id, name, first_name, last_name, phone, company_name, email, state, city, status, lead_type, lead_type_label, revenue, monthly_deposit, requested_amount, tib, fico, employee_size, why_funds'

type Db = ReturnType<typeof createServerClient>

async function openSession(db: Db, agentId: string) {
  const { data } = await db.from('dialer_agent_sessions').select(SESSION_COLUMNS).eq('agent_id', agentId).neq('status', 'ended').maybeSingle()
  return data
}

async function setAgentStatus(db: Db, agentId: string, status: 'busy' | 'available') {
  await db.from('agents').update({ status, updated_at: new Date().toISOString() }).eq('id', agentId)
}

export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const agentId = caller.id
  const db = createServerClient()

  const session = await openSession(db, agentId)
  if (!session) return NextResponse.json({ session: null })

  await db.from('dialer_agent_sessions').update({ last_heartbeat_at: new Date().toISOString() }).eq('id', session.id)
  pace(db, session.tenant_id).catch(err => console.error('[predictive] pace failed', err))

  let lead = null
  let attempt = null
  if (session.current_attempt_id) {
    attempt = await loadAttempt(db, session.current_attempt_id)
    if (attempt?.lead_id) {
      const { data } = await db.from('leads').select(LEAD_COLUMNS).eq('id', attempt.lead_id).maybeSingle()
      lead = data
    }
  }
  return NextResponse.json({
    session,
    attempt: attempt ? { id: attempt.id, phone: attempt.phone, caller_id: attempt.caller_id, status: attempt.status, connected_at: attempt.connected_at } : null,
    lead,
  })
}

export async function POST(req: NextRequest) {
  const { action } = await req.json()
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()

  const { data: agent } = await db.from('agents').select('id, tenant_id, sip_username, did').eq('id', caller.id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })

  if (action === 'start') {
    if (caller.actingAs) return switchedAccount()
    const settings = await getDialerSettings(db, agent.tenant_id)
    if (!settings.predictive_enabled) return NextResponse.json({ error: 'Predictive dialing is not turned on for your account.' }, { status: 403 })
    const problems = await predictiveSetupProblems()
    if (problems.length) return NextResponse.json({ error: `Predictive dialing isn't set up yet: ${problems.join(' ')}` }, { status: 409 })
    if (!agent.sip_username) return NextResponse.json({ error: 'Your softphone login is missing — ask an admin to set your SIP username.' }, { status: 409 })

    const existing = await openSession(db, agent.id)
    if (existing) {
      // A previous tab that went quiet: close it out and start fresh.
      const { data: fresh } = await db.from('dialer_agent_sessions').select('last_heartbeat_at').eq('id', existing.id).single()
      if (fresh && Date.now() - new Date(fresh.last_heartbeat_at).getTime() < HEARTBEAT_STALE_MS) {
        return NextResponse.json({ session: existing })
      }
      await db.from('dialer_agent_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', existing.id)
      await hangupCall(existing.agent_call_control_id)
    }

    const { data: session, error } = await db
      .from('dialer_agent_sessions')
      .insert({ tenant_id: agent.tenant_id, agent_id: agent.id, status: 'connecting' })
      .select(SESSION_COLUMNS)
      .single()
    if (error || !session) return NextResponse.json({ error: error?.message || 'Could not start session' }, { status: 500 })

    const { data: anyNumber } = await db.from('dialer_caller_ids').select('phone_number').eq('tenant_id', agent.tenant_id).eq('enabled', true).limit(1).maybeSingle()
    const from = toE164(agent.did || '') || anyNumber?.phone_number || null
    if (!from) {
      await db.from('dialer_agent_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', session.id)
      return NextResponse.json({ error: 'You need an outbound number (your DID or a local presence number) before starting.' }, { status: 409 })
    }

    try {
      const res = await telnyxRequest('POST', '/calls', {
        connection_id: await getConfigValue('telnyx_call_control_connection_id'),
        to: `sip:${agent.sip_username}@sip.telnyx.com`,
        from,
        from_display_name: 'PREDICTIVE',
        timeout_secs: 30,
        client_state: encodeClientState({ k: 'agent', s: session.id }),
        webhook_url: `${(await getAppUrl()).replace(/\/$/, '')}/api/webhooks/dialer`,
      })
      const ccid = res?.data?.call_control_id ?? null
      await db.from('dialer_agent_sessions').update({ agent_call_control_id: ccid }).eq('id', session.id)
      await setAgentStatus(db, agent.id, 'busy')
      return NextResponse.json({ session: { ...session, agent_call_control_id: ccid }, expectFrom: from })
    } catch (err) {
      await db.from('dialer_agent_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', session.id)
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not connect you' }, { status: 502 })
    }
  }

  const session = await openSession(db, agent.id)
  if (!session) return NextResponse.json({ session: null })

  if (action === 'ready') {
    await db.from('dialer_agent_sessions')
      .update({ status: 'ready', current_attempt_id: null, ready_since: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() })
      .eq('id', session.id)
      .eq('status', 'wrapup')
    pace(db, session.tenant_id).catch(err => console.error('[predictive] pace failed', err))
    return NextResponse.json({ ok: true })
  }

  if (action === 'hangup_lead') {
    if (session.current_attempt_id) {
      const attempt = await loadAttempt(db, session.current_attempt_id)
      await hangupCall(attempt?.call_control_id)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'stop') {
    // Mark ended first so the pacer stops counting this agent before the hangups land.
    await db.from('dialer_agent_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', session.id)
    if (session.status === 'on_call' && session.current_attempt_id) {
      const attempt = await loadAttempt(db, session.current_attempt_id)
      await hangupCall(attempt?.call_control_id)
    }
    await hangupCall(session.agent_call_control_id)
    await setAgentStatus(db, agent.id, 'available')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
