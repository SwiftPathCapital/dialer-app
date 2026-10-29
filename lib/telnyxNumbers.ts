import type { createServerClient } from './supabase'
import { telnyxRequest } from './telnyxApi'
import { areaCodeOf, normalizeState } from './callingHours'
import { toE164 } from './localPresence'

// Numbers on the shared Telnyx account, and handing one to a client as a local presence
// number. Platform-admin only (callers check that).

type Db = ReturnType<typeof createServerClient>

export interface TelnyxNumber {
  id: string
  phone_number: string
  status: string
  connection_id: string | null
  connection_name: string | null
  messaging_profile_id: string | null
  messaging_profile_name: string | null
}

export function digits10(n: string | null | undefined) { return (n || '').replace(/\D/g, '').slice(-10) }

export async function listAccountNumbers(): Promise<TelnyxNumber[]> {
  const numbers: TelnyxNumber[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await telnyxRequest('GET', `/phone_numbers?page[number]=${page}&page[size]=250`)
    numbers.push(...(res?.data ?? []))
    if (page >= (res?.meta?.total_pages ?? 1)) break
  }
  return numbers
}

// The voice connection / messaging profile the dialer's existing numbers (group lines and
// agent lines) already use. A local number on a different one won't deliver callbacks or
// texts to the dialer, so new purchases go on these and the assign screen flags mismatches.
export async function expectedRouting(db: Db, numbers: TelnyxNumber[]) {
  const [{ data: groups }, { data: agents }] = await Promise.all([
    db.from('inbound_groups').select('phone_number'),
    db.from('agents').select('did'),
  ])
  const coreDigits = new Set([...(groups ?? []).map(g => digits10(g.phone_number)), ...(agents ?? []).map(a => digits10(a.did))].filter(Boolean))
  const core = numbers.filter(n => coreDigits.has(digits10(n.phone_number)))
  const mostCommon = (vals: (string | null)[]) => {
    const counts = new Map<string, number>()
    for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const connectionId = mostCommon(core.map(n => n.connection_id))
  const messagingProfileId = mostCommon(core.map(n => n.messaging_profile_id))
  return {
    connectionId,
    messagingProfileId,
    connectionName: numbers.find(n => n.connection_id === connectionId)?.connection_name ?? null,
    messagingProfileName: numbers.find(n => n.messaging_profile_id === messagingProfileId)?.messaging_profile_name ?? null,
  }
}

// Assigns a number to a client. Group lines and agent lines must keep routing the way they
// do today, so those are refused.
export async function assignCallerId(db: Db, input: {
  tenant_id: string; phone_number: string; state?: string | null; label?: string | null; telnyx_number_id?: string | null
}): Promise<{ data: Record<string, unknown> } | { error: string; status: number }> {
  const e164 = toE164(input.phone_number || '')
  if (!e164) return { error: 'Enter a 10-digit US number', status: 400 }
  const st = input.state ? normalizeState(input.state) : null
  if (input.state && !st) return { error: 'Unknown state', status: 400 }
  const { data: tenant } = await db.from('tenants').select('id').eq('id', input.tenant_id).maybeSingle()
  if (!tenant) return { error: 'Unknown client', status: 400 }

  const d = digits10(e164)
  const [{ data: groups }, { data: agents }] = await Promise.all([
    db.from('inbound_groups').select('name, phone_number'),
    db.from('agents').select('name, did'),
  ])
  const clash = (groups ?? []).find(g => digits10(g.phone_number) === d)?.name
    ?? (agents ?? []).find(a => digits10(a.did) === d)?.name
  if (clash) return { error: `That number is already in use by ${clash}`, status: 409 }

  const { data, error } = await db
    .from('dialer_caller_ids')
    .insert({
      tenant_id: input.tenant_id,
      phone_number: e164,
      area_code: areaCodeOf(e164),
      state: st,
      label: typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 80) : null,
      telnyx_number_id: input.telnyx_number_id || null,
    })
    .select()
    .single()
  if (error) {
    return error.code === '23505'
      ? { error: 'That number is already assigned to a client', status: 409 }
      : { error: error.message, status: 500 }
  }
  return { data }
}
