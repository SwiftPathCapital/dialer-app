import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [agentsRes, activeCallsRes, todayCallsRes, membershipsRes] = await Promise.all([
    db.from('agents').select('id, name, email, status').order('name'),
    db.from('dialer_calls')
      .select('agent_id, group_id, direction, from_number, to_number, status, started_at, telnyx_call_control_id')
      .in('status', ['initiated', 'ringing', 'active'])
      .gte('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('started_at', { ascending: false }),
    db.from('dialer_calls')
      .select('agent_id, direction, duration_seconds')
      .gte('started_at', today.toISOString()),
    db.from('inbound_group_members').select('agent_id, group_id'),
  ])

  const agents = agentsRes.data || []
  const activeCalls = activeCallsRes.data || []
  const todayCalls: { agent_id: string | null; direction: string; duration_seconds: number | null }[] = todayCallsRes.data || []
  const memberships: { agent_id: string; group_id: string }[] = membershipsRes.data || []

  function avgTalk(calls: typeof todayCalls) {
    const talking = calls.filter(c => c.duration_seconds && c.duration_seconds > 30)
    if (!talking.length) return null
    return Math.round(talking.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / talking.length)
  }

  // Group calls ringing all members — only show during the actual ring window (dial timeout is 20s)
  const ringCutoff = new Date(Date.now() - 25 * 1000).toISOString()
  const groupCalls = activeCalls.filter(c => !c.agent_id && c.group_id && c.started_at > ringCutoff)

  const result = agents.map(agent => {
    // Direct call attributed to this agent
    let activeCall = activeCalls.find(c => c.agent_id === agent.id) ?? null

    // Fall back: group call ringing/active for a group this agent belongs to
    if (!activeCall) {
      const agentGroupIds = memberships.filter(m => m.agent_id === agent.id).map(m => m.group_id)
      const groupCall = groupCalls.find(c => agentGroupIds.includes(c.group_id!)) ?? null
      activeCall = groupCall
    }

    const agentCalls = todayCalls.filter(c => c.agent_id === agent.id)
    const outboundCalls = agentCalls.filter(c => c.direction === 'outbound')
    const inboundCalls  = agentCalls.filter(c => c.direction === 'inbound')

    return {
      ...agent,
      activeCall: activeCall
        ? {
            direction: activeCall.direction,
            remoteNumber: activeCall.direction === 'inbound' ? activeCall.from_number : activeCall.to_number,
            status: activeCall.status,
            started_at: activeCall.started_at,
            telnyx_call_control_id: activeCall.telnyx_call_control_id,
          }
        : null,
      callsToday:      agentCalls.length,
      outboundToday:   outboundCalls.length,
      inboundToday:    inboundCalls.length,
      avgTalkOutbound: avgTalk(outboundCalls),
      avgTalkInbound:  avgTalk(inboundCalls),
    }
  })

  return NextResponse.json(result)
}
