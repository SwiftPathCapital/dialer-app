import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized } from '@/lib/caller'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const caller = await getCaller()
  if (!caller) return unauthorized()
  // Agents see their own history; admins may pick a teammate (or omit for the whole account).
  const agentId = isAdmin(caller) ? searchParams.get('agent_id') : caller.id
  const toNumber = searchParams.get('to_number')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 1000)

  const db = createServerClient()
  const tenantId = caller.tenantId

  // Inbound group calls have agent_id=null; include them if the agent is in the group
  let groupIds: string[] = []
  if (agentId) {
    const { data: memberships } = await db
      .from('inbound_group_members')
      .select('group_id')
      .eq('agent_id', agentId)
    groupIds = memberships?.map((m: { group_id: string }) => m.group_id) ?? []
  }

  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  let query = db
    .from('dialer_calls')
    .select('*')
    .not('telnyx_call_control_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  query = query.eq('tenant_id', tenantId)
  if (dateFrom) query = query.gte('started_at', dateFrom)
  if (dateTo) query = query.lte('started_at', dateTo)

  const fromNumber = searchParams.get('from_number')
  const directionFilter = searchParams.get('direction')
  const statusFilter = searchParams.get('status')

  if (toNumber) {
    query = query.ilike('to_number', `%${toNumber}%`)
  } else if (fromNumber) {
    query = query.ilike('from_number', `%${fromNumber}%`)
    if (directionFilter) query = query.eq('direction', directionFilter)
    if (statusFilter) query = query.eq('status', statusFilter)
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
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const tenantId = caller.tenantId

  // When an agent answers an inbound call, attribute it to them
  if (body.action === 'answer') {
    const { remoteNumber, groupId, groupName, agentCallLegId } = body
    if (!remoteNumber) return NextResponse.json({ error: 'No remoteNumber' }, { status: 400 })

    const updates: Record<string, string> = { agent_id: caller.id, status: 'active' }
    if (agentCallLegId) updates.agent_call_leg_id = agentCallLegId

    let query = db
      .from('dialer_calls')
      .update(updates)
      .ilike('from_number', `%${remoteNumber}%`)
      .in('status', ['ringing', 'initiated'])
      .is('ended_at', null)
      .is('agent_id', null)
      .eq('tenant_id', tenantId)

    // Narrow to the specific group — prefer the ID (exact), fall back to name lookup
    if (groupId) {
      query = query.eq('group_id', groupId)
    } else if (groupName) {
      const { data: group } = await db
        .from('inbound_groups')
        .select('id')
        .eq('name', groupName)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (group) query = query.eq('group_id', group.id)
    }

    // Return the caller's telnyx_call_control_id — this is a real CC API ID we can record on
    const { data: updatedCalls } = await query.select('telnyx_call_control_id')
    const callerControlId = updatedCalls?.[0]?.telnyx_call_control_id

    // Start recording on the caller's call leg (TeXML CallSid = valid CC API call_control_id)
    if (callerControlId) {
      const [apiKeyRes, appUrlRes] = await Promise.all([
        db.from('app_config').select('value').eq('key', 'telnyx_api_key').single(),
        db.from('app_config').select('value').eq('key', 'app_url').single(),
      ])
      const apiKey = apiKeyRes.data?.value
      const appUrl = appUrlRes.data?.value || process.env.NEXT_PUBLIC_APP_URL || ''
      if (apiKey && appUrl) {
        await fetch(`https://api.telnyx.com/v2/calls/${callerControlId}/actions/record_start`, {
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
    // Only record a call this agent placed (the row is written by POST when they dial).
    const { data: own } = await db
      .from('dialer_calls')
      .select('id')
      .eq('telnyx_call_control_id', callControlId)
      .eq('agent_id', caller.id)
      .eq('tenant_id', tenantId)
      .limit(1)
    if (!own?.length) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

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

  // Update outbound call status + duration when the WebRTC call ends in the browser
  if (body.action === 'end') {
    const { callControlId, duration_seconds, status } = body
    const agentId = caller.id
    const updates = {
      status: status || 'completed',
      duration_seconds: duration_seconds ?? null,
      ended_at: new Date().toISOString(),
    }

    // Try exact match by call control ID first
    if (callControlId) {
      const { data: matched } = await db
        .from('dialer_calls')
        .update(updates)
        .eq('telnyx_call_control_id', callControlId)
        .eq('agent_id', agentId)
        .eq('tenant_id', tenantId)
        .select('id')
      if (matched && matched.length > 0) return NextResponse.json({ ok: true })
    }

    // Fallback: match most recent initiated/active outbound call for this agent
    // (handles page-refresh / ID-mismatch cases)
    {
      const { data: recent } = await db
        .from('dialer_calls')
        .select('id')
        .eq('agent_id', agentId)
        .eq('tenant_id', tenantId)
        .eq('direction', 'outbound')
        .in('status', ['initiated', 'active'])
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
      if (recent && recent.length > 0) {
        await db.from('dialer_calls').update(updates).eq('id', recent[0].id).eq('tenant_id', tenantId)
      }
    }
    return NextResponse.json({ ok: true })
  }

  // Clean up stuck 'initiated' outbound calls from a previous browser session
  if (body.action === 'cleanup') {
    const agentId = caller.id
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    await db
      .from('dialer_calls')
      .update({ status: 'no-answer', ended_at: new Date().toISOString() })
      .eq('agent_id', agentId)
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .eq('status', 'initiated')
      .is('ended_at', null)
      .lt('started_at', fiveMinAgo)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const tenantId = caller.tenantId

  const { data, error } = await db
    .from('dialer_calls')
    .insert({
      direction: 'outbound',
      from_number: body.from_number,
      to_number: body.to_number,
      agent_id: caller.id,
      tenant_id: tenantId,
      status: 'initiated',
      started_at: new Date().toISOString(),
      telnyx_call_control_id: body.telnyx_call_control_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stamp last_called_at on the lead so it won't appear in the dialer queue for 8 hours.
  // Guard against short/malformed numbers (e.g. a stray "1") whose ilike pattern would
  // match nearly every phone number in the table.
  const toDigits = (body.to_number || '').replace(/\D/g, '')
  if (toDigits.length >= 7) {
    let updateQuery = db
      .from('leads')
      .update({ last_called_at: new Date().toISOString() })
      .ilike('phone', `%${toDigits}%`)
    updateQuery = updateQuery.eq('tenant_id', tenantId)
    await updateQuery
  }

  return NextResponse.json(data)
}
