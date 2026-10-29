import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getActor } from '@/lib/authz'
import { telnyxRequest, TelnyxError } from '@/lib/telnyxApi'
import { areaCodeOf, normalizeState } from '@/lib/callingHours'
import { toE164 } from '@/lib/localPresence'

// Platform admin only: every Telnyx client shares one Telnyx account, so assigning a number
// to a client is the account manager's job — a client admin must never see or claim
// another client's numbers.

interface TelnyxNumber {
  id: string
  phone_number: string
  status: string
  connection_id: string | null
  connection_name: string | null
  messaging_profile_id: string | null
  messaging_profile_name: string | null
}

function digits10(n: string | null | undefined) { return (n || '').replace(/\D/g, '').slice(-10) }

export async function GET(req: NextRequest) {
  const db = createServerClient()
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const numbers: TelnyxNumber[] = []
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await telnyxRequest('GET', `/phone_numbers?page[number]=${page}&page[size]=250`)
      numbers.push(...(res?.data ?? []))
      if (page >= (res?.meta?.total_pages ?? 1)) break
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not list Telnyx numbers' }, { status: err instanceof TelnyxError ? err.status : 500 })
  }

  const [{ data: assigned }, { data: groups }, { data: agents }, { data: tenants }] = await Promise.all([
    db.from('dialer_caller_ids').select('id, phone_number, tenant_id'),
    db.from('inbound_groups').select('name, phone_number, tenant_id'),
    db.from('agents').select('name, did, tenant_id'),
    db.from('tenants').select('id, name'),
  ])
  const tenantName = new Map((tenants ?? []).map(t => [t.id, t.name]))

  // The voice connection / messaging profile the dialer's existing numbers already use —
  // a local number on a different one won't deliver callbacks or texts to the dialer.
  const coreDigits = new Set([...(groups ?? []).map(g => digits10(g.phone_number)), ...(agents ?? []).map(a => digits10(a.did))].filter(Boolean))
  const core = numbers.filter(n => coreDigits.has(digits10(n.phone_number)))
  const mostCommon = (vals: (string | null)[]) => {
    const counts = new Map<string, number>()
    for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const expectedConnectionId = mostCommon(core.map(n => n.connection_id))
  const expectedMessagingProfileId = mostCommon(core.map(n => n.messaging_profile_id))

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

  const expected = {
    connection_name: numbers.find(n => n.connection_id === expectedConnectionId)?.connection_name ?? null,
    messaging_profile_name: numbers.find(n => n.messaging_profile_id === expectedMessagingProfileId)?.messaging_profile_name ?? null,
  }
  return NextResponse.json({ numbers: rows, expected })
}

export async function POST(req: NextRequest) {
  const { tenant_id, phone_number, state, label, telnyx_number_id } = await req.json()
  const db = createServerClient()
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const e164 = toE164(phone_number || '')
  if (!e164) return NextResponse.json({ error: 'Enter a 10-digit US number' }, { status: 400 })
  const st = state ? normalizeState(state) : null
  if (state && !st) return NextResponse.json({ error: 'Unknown state' }, { status: 400 })
  const { data: tenant } = await db.from('tenants').select('id').eq('id', tenant_id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Unknown client' }, { status: 400 })

  // A group line or agent line must keep routing the way it does today.
  const d = digits10(e164)
  const [{ data: groups }, { data: agents }] = await Promise.all([
    db.from('inbound_groups').select('name, phone_number'),
    db.from('agents').select('name, did'),
  ])
  const clash = (groups ?? []).find(g => digits10(g.phone_number) === d)?.name
    ?? (agents ?? []).find(a => digits10(a.did) === d)?.name
  if (clash) return NextResponse.json({ error: `That number is already in use by ${clash}` }, { status: 409 })

  const { data, error } = await db
    .from('dialer_caller_ids')
    .insert({
      tenant_id,
      phone_number: e164,
      area_code: areaCodeOf(e164),
      state: st,
      label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : null,
      telnyx_number_id: telnyx_number_id || null,
    })
    .select()
    .single()
  if (error) {
    const msg = error.code === '23505' ? 'That number is already assigned to a client' : error.message
    return NextResponse.json({ error: msg }, { status: error.code === '23505' ? 409 : 500 })
  }
  return NextResponse.json(data)
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
