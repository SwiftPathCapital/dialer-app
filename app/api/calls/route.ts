import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const toNumber = searchParams.get('to_number')
  const limit = parseInt(searchParams.get('limit') || '50')

  const db = createServerClient()

  // Inbound group calls have agent_id=null; include them if the agent is in the group
  let groupIds: string[] = []
  if (agentId) {
    const { data: memberships } = await db
      .from('inbound_group_members')
      .select('group_id')
      .eq('agent_id', agentId)
    groupIds = memberships?.map((m: { group_id: string }) => m.group_id) ?? []
  }

  let query = db
    .from('dialer_calls')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)

  const fromNumber = searchParams.get('from_number')
  const directionFilter = searchParams.get('direction')

  if (toNumber) {
    query = query.ilike('to_number', `%${toNumber}%`)
  } else if (fromNumber) {
    query = query.ilike('from_number', `%${fromNumber}%`)
    if (directionFilter) query = query.eq('direction', directionFilter)
  } else if (agentId && groupIds.length > 0) {
    query = query.or(`agent_id.eq.${agentId},group_id.in.(${groupIds.join(',')})`)
  } else if (agentId) {
    query = query.eq('agent_id', agentId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()

  // When an agent answers an inbound call, attribute it to them
  if (body.action === 'answer') {
    const { agentId, remoteNumber, groupName, agentCallLegId } = body

    const updates: Record<string, string> = { agent_id: agentId, status: 'active' }
    if (agentCallLegId) updates.agent_call_leg_id = agentCallLegId

    let query = db
      .from('dialer_calls')
      .update(updates)
      .ilike('from_number', `%${remoteNumber}%`)
      .in('status', ['ringing', 'initiated'])
      .is('ended_at', null)
      .is('agent_id', null)

    // Narrow to the specific group if we have the name (avoids matching unrelated calls)
    if (groupName) {
      const { data: group } = await db
        .from('inbound_groups')
        .select('id')
        .eq('name', groupName)
        .single()
      if (group) query = query.eq('group_id', group.id)
    }

    await query

    // Start recording on the agent's call leg
    if (agentCallLegId) {
      const [apiKeyRes, appUrlRes] = await Promise.all([
        db.from('app_config').select('value').eq('key', 'telnyx_api_key').single(),
        db.from('app_config').select('value').eq('key', 'app_url').single(),
      ])
      const apiKey = apiKeyRes.data?.value
      const appUrl = appUrlRes.data?.value || process.env.NEXT_PUBLIC_APP_URL || ''
      if (apiKey && appUrl) {
        await fetch(`https://api.telnyx.com/v2/calls/${agentCallLegId}/actions/record_start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: 'mp3',
            channels: 'dual',
            webhook_url: `${appUrl}/api/webhooks/voice/call-recording`,
          }),
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  }

  // Start recording on an outbound call leg
  if (body.action === 'record') {
    const { callControlId } = body
    if (!callControlId) return NextResponse.json({ error: 'No callControlId' }, { status: 400 })

    const [apiKeyRes, appUrlRes] = await Promise.all([
      db.from('app_config').select('value').eq('key', 'telnyx_api_key').single(),
      db.from('app_config').select('value').eq('key', 'app_url').single(),
    ])
    const apiKey = apiKeyRes.data?.value
    const appUrl = appUrlRes.data?.value || process.env.NEXT_PUBLIC_APP_URL || ''
    if (apiKey && appUrl) {
      await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/record_start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'mp3',
          channels: 'dual',
          webhook_url: `${appUrl}/api/webhooks/voice/call-recording`,
        }),
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('dialer_calls')
    .insert({
      direction: 'outbound',
      from_number: body.from_number,
      to_number: body.to_number,
      agent_id: body.agent_id,
      status: 'initiated',
      started_at: new Date().toISOString(),
      telnyx_call_control_id: body.telnyx_call_control_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
