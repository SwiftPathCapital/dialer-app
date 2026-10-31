import type { createServerClient } from './supabase'
import { areaCodeOf, resolveLeadState } from './callingHours'

type Db = ReturnType<typeof createServerClient>

export interface CallerIdRow {
  phone_number: string
  area_code: string
  state: string | null
  enabled: boolean
  sms_enabled: boolean
}

export type MatchKind = 'area_code' | 'state' | 'none'

// Stable hash so a given lead always sees the same local number on every call — better for
// answer rates, number reputation, and makes a callback recognisable.
function stableIndex(key: string, n: number): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % n
}

export function chooseCallerId(
  numbers: CallerIdRow[],
  toPhone: string,
  leadState: string | null,
  opts: { requireSms?: boolean } = {},
): { number: string | null; match: MatchKind } {
  const pool = numbers
    .filter(n => n.enabled && (!opts.requireSms || n.sms_enabled))
    .sort((a, b) => a.phone_number.localeCompare(b.phone_number))
  const digits = toPhone.replace(/\D/g, '').slice(-10)
  const area = areaCodeOf(toPhone)
  const state = resolveLeadState(leadState, toPhone)

  const byArea = area ? pool.filter(n => n.area_code === area) : []
  if (byArea.length) return { number: byArea[stableIndex(digits, byArea.length)].phone_number, match: 'area_code' }

  const byState = state ? pool.filter(n => n.state === state) : []
  if (byState.length) return { number: byState[stableIndex(digits, byState.length)].phone_number, match: 'state' }

  return { number: null, match: 'none' }
}

export async function loadCallerIds(db: Db, tenantId: string): Promise<CallerIdRow[]> {
  const { data } = await db
    .from('dialer_caller_ids')
    .select('phone_number, area_code, state, enabled, sms_enabled')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
  return (data ?? []) as CallerIdRow[]
}

export function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return null
}
