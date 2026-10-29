import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getActor } from '@/lib/authz'
import { telnyxRequest, TelnyxError } from '@/lib/telnyxApi'
import { normalizeState } from '@/lib/callingHours'
import { listAccountNumbers, expectedRouting, assignCallerId, digits10 } from '@/lib/telnyxNumbers'
import { toE164 } from '@/lib/localPresence'

// Platform admin only. GET searches numbers Telnyx has for sale; POST buys ONE number on
// the shared Telnyx account (real money — the browser shows the price and asks first, and
// the request must carry confirm: true) and assigns it to a client as a local number.

interface AvailableNumber {
  phone_number: string
  region_information?: { region_type: string; region_name: string }[]
  cost_information?: { upfront_cost?: string; monthly_cost?: string; currency?: string }
  features?: { name: string }[]
}

const telnyxFail = (err: unknown, fallback: string) =>
  NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status: err instanceof TelnyxError && err.status < 500 ? 400 : 502 })

export async function GET(req: NextRequest) {
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const areaCode = (searchParams.get('area_code') || '').replace(/\D/g, '')
  const state = searchParams.get('state') ? normalizeState(searchParams.get('state')!) : null
  if (areaCode && areaCode.length !== 3) return NextResponse.json({ error: 'Area codes are 3 digits' }, { status: 400 })
  if (!areaCode && !state) return NextResponse.json({ error: 'Enter an area code or a state' }, { status: 400 })

  const q = new URLSearchParams({ 'filter[country_code]': 'US', 'filter[phone_number_type]': 'local', 'filter[limit]': '20' })
  q.append('filter[features][]', 'voice')
  q.append('filter[features][]', 'sms')
  if (areaCode) q.set('filter[national_destination_code]', areaCode)
  if (state) q.set('filter[administrative_area]', state)

  let data: AvailableNumber[]
  try {
    data = (await telnyxRequest('GET', `/available_phone_numbers?${q}`))?.data ?? []
  } catch (err) {
    return telnyxFail(err, 'Could not search Telnyx')
  }

  return NextResponse.json({
    numbers: data.map(n => ({
      phone_number: n.phone_number,
      state: n.region_information?.find(r => r.region_type === 'state')?.region_name ?? state,
      city: n.region_information?.find(r => r.region_type === 'rate_center')?.region_name ?? null,
      monthly_cost: n.cost_information?.monthly_cost ?? null,
      upfront_cost: n.cost_information?.upfront_cost ?? null,
      currency: n.cost_information?.currency ?? 'USD',
      sms: (n.features ?? []).some(f => f.name === 'sms'),
    })),
  })
}

export async function POST(req: NextRequest) {
  const actor = await getActor()
  if (!actor?.is_platform_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { phone_number, tenant_id, state, confirm } = await req.json().catch(() => ({}))
  if (confirm !== true) return NextResponse.json({ error: 'Purchase not confirmed' }, { status: 400 })
  const e164 = toE164(phone_number || '')
  if (!e164) return NextResponse.json({ error: 'Pick a number to buy' }, { status: 400 })

  const db = createServerClient()
  const { data: tenant } = await db.from('tenants').select('id, name').eq('id', tenant_id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Unknown client' }, { status: 400 })

  // Buy on the same voice connection / messaging profile as the dialer's existing numbers,
  // so callbacks and texts reach the dialer. Refuse rather than buy a number that won't work.
  let owned
  try {
    owned = await listAccountNumbers()
  } catch (err) {
    return telnyxFail(err, 'Could not reach Telnyx')
  }
  if (owned.some(n => digits10(n.phone_number) === digits10(e164))) {
    return NextResponse.json({ error: 'That number is already on your Telnyx account — assign it instead.' }, { status: 409 })
  }
  const routing = await expectedRouting(db, owned)
  if (!routing.connectionId) {
    return NextResponse.json({ error: 'Could not tell which Telnyx voice connection the dialer uses. Assign a group or agent line first.' }, { status: 409 })
  }

  let order
  try {
    order = (await telnyxRequest('POST', '/number_orders', {
      phone_numbers: [{ phone_number: e164 }],
      connection_id: routing.connectionId,
      ...(routing.messagingProfileId ? { messaging_profile_id: routing.messagingProfileId } : {}),
      customer_reference: `dialer:${tenant.id}`,
    }))?.data
  } catch (err) {
    return telnyxFail(err, 'Telnyx did not accept the order')
  }
  if (!order || order.status === 'failure') {
    return NextResponse.json({ error: 'Telnyx could not complete the order. Check the order in the Telnyx portal before trying another number.' }, { status: 502 })
  }
  console.info(`[numbers] ${actor.id} bought ${e164} for ${tenant.id} (${tenant.name}); order ${order.id} ${order.status}`)

  const assigned = await assignCallerId(db, { tenant_id: tenant.id, phone_number: e164, state: state || null })
  if ('error' in assigned) {
    // The number is bought either way — say so, so it isn't bought twice.
    return NextResponse.json({ ok: true, order_id: order.id, order_status: order.status, warning: `Bought ${e164}, but couldn't assign it: ${assigned.error}. Assign it from the list once it appears.` })
  }
  return NextResponse.json({ ok: true, order_id: order.id, order_status: order.status, caller_id: assigned.data })
}
