import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isCallableNow } from '@/lib/callingHours'
import { COOLDOWN_MS } from '@/lib/leadQueue'
import { getDialerSettings } from '@/lib/dialerSettings'
import { chooseCallerId, loadCallerIds } from '@/lib/localPresence'

/**
 * GET /api/calls/preflight?phone=<number>&agent_id=<id>[&bypass_cooldown=1]
 *
 * Runs right before every outbound dial from the browser:
 *  - 8-hour cooldown (skippable for deliberate dials like scheduled callbacks / dialpad)
 *  - calling hours in the lead's local time (never skippable — applies to any number that
 *    matches a lead; numbers that aren't leads, e.g. a vendor, are never blocked)
 *  - which caller ID to present (local presence number when enabled, else the agent's DID)
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') || ''
  const agentId = req.nextUrl.searchParams.get('agent_id')
  const bypassCooldown = req.nextUrl.searchParams.get('bypass_cooldown') === '1'
  const digits = phone.replace(/\D/g, '')

  const db = createServerClient()
  const { data: agentRow } = agentId
    ? await db.from('agents').select('tenant_id, did, extension, sip_username').eq('id', agentId).maybeSingle()
    : { data: null }
  const tenantId: string | null = agentRow?.tenant_id ?? null
  const fallbackCallerId: string | null = agentRow?.did || agentRow?.extension || agentRow?.sip_username || null

  if (digits.length < 7) return NextResponse.json({ blocked: false, callerId: fallbackCallerId })

  // Match on the last 10 digits so "+15551234567" and "5551234567" find the same lead.
  let leadQuery = db
    .from('leads')
    .select('id, state, phone, last_called_at')
    .ilike('phone', `%${digits.slice(-10)}%`)
    .order('last_called_at', { ascending: false, nullsFirst: false })
    .limit(1)
  if (tenantId) leadQuery = leadQuery.eq('tenant_id', tenantId)
  const { data: lead } = await leadQuery.maybeSingle()

  if (lead && !bypassCooldown && lead.last_called_at) {
    const until = new Date(new Date(lead.last_called_at).getTime() + COOLDOWN_MS)
    if (until.getTime() > Date.now()) {
      return NextResponse.json({ blocked: true, reason: 'cooldown', until: until.toISOString() })
    }
  }

  if (lead) {
    const hours = isCallableNow({ state: lead.state, phone: lead.phone || phone })
    if (!hours.ok) return NextResponse.json({ blocked: true, reason: 'calling_hours', message: hours.message })
  }

  let callerId = fallbackCallerId
  let match: string = 'agent'
  if (tenantId) {
    const settings = await getDialerSettings(db, tenantId)
    if (settings.local_presence_enabled) {
      const picked = chooseCallerId(await loadCallerIds(db, tenantId), phone, lead?.state ?? null)
      if (picked.number) { callerId = picked.number; match = picked.match }
    }
  }

  return NextResponse.json({ blocked: false, callerId, match })
}
