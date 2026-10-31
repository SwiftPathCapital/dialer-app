import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { createServerClient } from './supabase'
import { CALLER_HEADERS } from './callerHeaders'

// Server-only. The signed-in user for the current request, as verified by proxy.ts.

type Db = ReturnType<typeof createServerClient>

export interface Caller {
  id: string
  tenantId: string
  role: 'admin' | 'agent'
  isPlatformAdmin: boolean
  // True while a platform admin is working inside another account (tenantId is that
  // account; homeTenantId is their own). Personal actions — placing calls, owning events —
  // are refused while switched so no row mixes one account's agent with another's data.
  actingAs: boolean
  homeTenantId: string
}

export async function getCaller(): Promise<Caller | null> {
  let h: Awaited<ReturnType<typeof headers>>
  try { h = await headers() } catch { return null }
  const id = h.get(CALLER_HEADERS.id)
  const tenantId = h.get(CALLER_HEADERS.tenant)
  if (!id || !tenantId) return null
  const homeTenantId = h.get(CALLER_HEADERS.homeTenant) || tenantId
  return {
    id,
    tenantId,
    role: h.get(CALLER_HEADERS.role) === 'admin' ? 'admin' : 'agent',
    isPlatformAdmin: h.get(CALLER_HEADERS.platformAdmin) === '1',
    actingAs: homeTenantId !== tenantId,
    homeTenantId,
  }
}

export function isAdmin(c: Caller | null): boolean {
  return !!c && (c.role === 'admin' || c.isPlatformAdmin)
}

export const unauthorized = () => NextResponse.json({ error: 'Please sign in again.', code: 'session_required' }, { status: 401 })
export const forbidden = (msg = 'You don\'t have permission to do that.') => NextResponse.json({ error: msg }, { status: 403 })
export const notFound = (msg = 'Not found') => NextResponse.json({ error: msg }, { status: 404 })
export const switchedAccount = () => NextResponse.json({ error: 'Switch back to your own account to do this.', code: 'acting_as' }, { status: 409 })

// The tenant a request acts in. For signed-in requests this is ALWAYS the caller's own
// tenant — whatever agent id the browser sent is ignored. Without a signed-in caller
// (Telnyx webhooks, scheduled jobs) it falls back to looking up the given agent.
export async function getAgentTenantId(db: Db, agentId?: string | null): Promise<string | null> {
  const caller = await getCaller()
  if (caller) return caller.tenantId
  if (!agentId) return null
  const { data } = await db.from('agents').select('tenant_id').eq('id', agentId).maybeSingle()
  return data?.tenant_id ?? null
}

// True when `agentId` is a member of the caller's tenant (for routes that act on another
// agent, e.g. an admin editing a teammate or assigning a lead).
export async function agentInTenant(db: Db, agentId: string | null | undefined, tenantId: string): Promise<boolean> {
  if (!agentId) return false
  const { data } = await db.from('agents').select('id').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle()
  return !!data
}

// Filter value that matches no rows — used so a missing tenant fails closed (empty
// result) instead of open (every tenant's rows).
export const NO_TENANT = '00000000-0000-0000-0000-000000000000'

// A sidebar feature is usable when neither the tenant nor the agent has it hidden.
// Platform admins always have access.
export async function canUseFeature(db: Db, caller: Caller, href: string): Promise<boolean> {
  if (caller.isPlatformAdmin) return true
  const [{ data: tenant }, { data: agent }] = await Promise.all([
    db.from('tenants').select('hidden_features').eq('id', caller.tenantId).maybeSingle(),
    db.from('agents').select('hidden_features').eq('id', caller.id).maybeSingle(),
  ])
  const hidden = [...(tenant?.hidden_features ?? []), ...(agent?.hidden_features ?? [])]
  return !hidden.includes(href)
}
