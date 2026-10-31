import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyTelnyxRequest } from '@/lib/telnyxWebhook'
import { decodeClientState, telnyxRequest } from '@/lib/telnyxApi'
import { pace, loadAttempt, connectOrAbandon, hangupCall, attemptStatusForHangup, CANCELLED_NO_AGENT } from '@/lib/predictive/engine'

// Telnyx Call Control webhooks for the predictive dialer only. Separate from the TeXML
// routes in ../voice so live inbound/outbound call handling is never touched by this.
//
// Two kinds of call legs arrive here, told apart by the client_state set when we dialed:
//   { k: 'agent', s: <session id> } — the agent's always-on connection
//   { k: 'lead',  a: <attempt id> } — an outbound call to a lead

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!(await verifyTelnyxRequest(raw, req.headers))) {
    console.warn('[dialer webhook] rejected: bad or missing signature')
    return new NextResponse('invalid signature', { status: 401 })
  }

  let body: { data?: { event_type?: string; payload?: Record<string, unknown> } }
  try { body = JSON.parse(raw) } catch { return new NextResponse('bad json', { status: 400 }) }
  const event = body.data?.event_type || ''
  const p = body.data?.payload || {}
  const callControlId = String(p.call_control_id || '')
  const state = decodeClientState(p.client_state as string | undefined)

  const db = createServerClient()
  let tenantToPace: string | null = null

  try {
    const isAgentLeg = state?.k === 'agent' || (!state && !!(await db.from('dialer_agent_sessions').select('id').eq('agent_call_control_id', callControlId).maybeSingle()).data)

    if (isAgentLeg) {
      const sessionQuery = db.from('dialer_agent_sessions').select('id, tenant_id, agent_id, status, current_attempt_id, conference_id')
      const { data: session } = state?.s
        ? await sessionQuery.eq('id', String(state.s)).maybeSingle()
        : await sessionQuery.eq('agent_call_control_id', callControlId).maybeSingle()
      if (!session) return NextResponse.json({ ok: true })
      tenantToPace = session.tenant_id

      if (event === 'call.answered' && session.status === 'connecting') {
        const conf = await telnyxRequest('POST', '/conferences', {
          call_control_id: callControlId,
          name: `predictive-${session.id}`,
          beep_enabled: 'never',
          start_conference_on_create: true,
        })
        await db.from('dialer_agent_sessions')
          .update({ status: 'ready', conference_id: conf?.data?.id ?? null, ready_since: new Date().toISOString(), agent_call_control_id: callControlId })
          .eq('id', session.id)
          .eq('status', 'connecting')
      } else if (event === 'call.hangup') {
        await db.from('dialer_agent_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', session.id)
        // Agent dropped mid-call: don't leave the lead talking to an empty conference.
        if (session.status === 'on_call' && session.current_attempt_id) {
          const attempt = await loadAttempt(db, session.current_attempt_id)
          await hangupCall(attempt?.call_control_id)
        }
        // The connection dropped without Stop (tab closed, network lost): Start marked the
        // agent busy, and nothing else would ever clear it — inbound groups skip busy agents.
        if (session.status !== 'ended') {
          await db.from('agents').update({ status: 'available', updated_at: new Date().toISOString() }).eq('id', session.agent_id).eq('status', 'busy')
        }
      }
      return NextResponse.json({ ok: true })
    }

    // ── Lead leg ──
    const attemptId = state?.k === 'lead' ? String(state.a) : null
    const attempt = attemptId
      ? await loadAttempt(db, attemptId)
      : await (async () => {
          const { data } = await db.from('dialer_dial_attempts').select('id').eq('call_control_id', callControlId).maybeSingle()
          return data ? loadAttempt(db, data.id) : null
        })()
    if (!attempt) return NextResponse.json({ ok: true })
    tenantToPace = attempt.tenant_id
    if (!attempt.call_control_id && callControlId) {
      await db.from('dialer_dial_attempts').update({ call_control_id: callControlId }).eq('id', attempt.id)
    }

    if (event === 'call.answered') {
      // Only the first answered event moves the attempt forward (webhooks can be retried).
      // A call we cancelled for lack of agents that got answered anyway is handled the
      // same way — connected if someone's free now, otherwise the abandoned-call message.
      const { data: moved } = await db.from('dialer_dial_attempts')
        .update({ status: 'answered', answered_at: new Date().toISOString(), ended_at: null })
        .eq('id', attempt.id)
        .or(`status.eq.dialing,and(status.eq.failed,hangup_cause.eq.${CANCELLED_NO_AGENT})`)
        .select('id')
      if (moved?.length) {
        const { data: settings } = await db.from('dialer_tenant_settings').select('predictive_amd_enabled').eq('tenant_id', attempt.tenant_id).maybeSingle()
        if (!settings?.predictive_amd_enabled) await connectOrAbandon(db, { ...attempt, status: 'answered' }, callControlId)
      }
    } else if (event === 'call.machine.detection.ended' || event === 'call.machine.premium.detection.ended') {
      const result = String(p.result || '')
      await db.from('dialer_dial_attempts').update({ amd_result: result }).eq('id', attempt.id)
      if (result === 'machine') {
        await db.from('dialer_dial_attempts').update({ status: 'machine' }).eq('id', attempt.id).eq('status', 'answered')
        await hangupCall(callControlId)
      } else {
        const current = await loadAttempt(db, attempt.id)
        if (current?.status === 'answered') await connectOrAbandon(db, current, callControlId)
      }
    } else if (event === 'call.speak.ended') {
      await hangupCall(callControlId)
    } else if (event === 'call.hangup') {
      const current = await loadAttempt(db, attempt.id)
      if (current) {
        const now = new Date()
        const next = attemptStatusForHangup(current.status, p.hangup_cause as string | undefined)
        await db.from('dialer_dial_attempts')
          .update({ ...(next ? { status: next } : {}), hangup_cause: (p.hangup_cause as string) ?? null, ended_at: now.toISOString() })
          .eq('id', current.id)

        if (current.status === 'connected') {
          const duration = current.connected_at ? Math.round((now.getTime() - new Date(current.connected_at).getTime()) / 1000) : null
          if (current.dialer_call_id) {
            await db.from('dialer_calls')
              .update({ status: 'completed', ended_at: now.toISOString(), duration_seconds: duration })
              .eq('id', current.dialer_call_id)
          }
          // The agent stays connected and moves to wrap-up; they click Ready when done.
          if (current.session_id) {
            await db.from('dialer_agent_sessions')
              .update({ status: 'wrapup' })
              .eq('id', current.session_id)
              .eq('status', 'on_call')
              .eq('current_attempt_id', current.id)
          }
        }
      }
    }
  } catch (err) {
    console.error('[dialer webhook] error handling', event, err)
  } finally {
    if (tenantToPace) pace(db, tenantToPace).catch(err => console.error('[dialer webhook] pace failed', err))
  }

  return NextResponse.json({ ok: true })
}
