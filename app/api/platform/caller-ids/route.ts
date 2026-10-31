import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getActor } from '@/lib/authz'
import { TelnyxError } from '@/lib/telnyxApi'
import { areaCodeOf } from '@/lib/callingHours'
import { listAccountNumbers, expectedRouting, assignCallerId, digits10, type TelnyxNumber } from '@/lib/telnyxNumbers'

// Platform admin only: every Telnyx client shares one Telnyx account, so assigning a number
// to a client is the account manager's job — a client admin must never see or claim
// another client's numbers.

export async function GET() {
  const db = createServerClient()
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let numbers: TelnyxNumber[]
  try {
    numbers = await listAccountNumbers()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not list Telnyx numbers' }, { status: err instanceof TelnyxError ? err.status : 500 })
  }

  const [{ data: assigned }, { data: groups }, { data: agents }, { data: tenants }, routing] = await Promise.all([
    db.from('dialer_caller_ids').select('id, phone_number, tenant_id'),
    db.from('inbound_groups').select('name, phone_number, tenant_id'),
    db.from('agents').select('name, did, tenant_id'),
    db.from('tenants').select('id, name'),
    expectedRouting(db, numbers),
  ])
  const tenantName = new Map((tenants ?? []).map(t => [t.id, t.name]))
  const expectedConnectionId = routing.connectionId
  const expectedMessagingProfileId = routing.messagingProfileId

  const rows = numbers.map(n => {
    const d = digits10(n.phone_number)
    const lp = (assigned ?? []).find(a => digits10(a.phone_number) === d)
    const group = (groups ?? []).find(g => digits10(g.phone_number) === d)
    const agent = (agents ?? []).find(a => digits10(a.did) === d)
    return {
      telnyx_number_id: n.id,
      phone_number: n.phone_number,
      area_code: areaCodeOf(n.phone_number),
      status: n.status,
      connection_name: n.connection_name,
      messaging_profile_name: n.messaging_profile_name,
      voice_ok: !expectedConnectionId || n.connection_id === expectedConnectionId,
      sms_ok: !expectedMessagingProfileId || n.messaging_profile_id === expectedMessagingProfileId,
      local_presence: lp ? { id: lp.id, tenant_id: lp.tenant_id, tenant_name: tenantName.get(lp.tenant_id) ?? 'Unknown' } : null,
      used_as: group ? `Group line: ${group.name}` : agent ? `Agent line: ${agent.name}` : null,
    }
  })

  const expected = { connection_name: routing.connectionName, messaging_profile_name: routing.messagingProfileName }
  return NextResponse.json({ numbers: rows, expected })
}

export async function POST(req: NextRequest) {
  const { tenant_id, phone_number, state, label, telnyx_number_id } = await req.json()
  const db = createServerClient()
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await assignCallerId(db, { tenant_id, phone_number, state, label, telnyx_number_id })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const db = createServerClient()
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await db.from('dialer_caller_ids').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
