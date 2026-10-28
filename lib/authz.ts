import type { createServerClient } from './supabase'

type Db = ReturnType<typeof createServerClient>

export interface Actor {
  id: string
  tenant_id: string
  role: 'admin' | 'agent'
  is_platform_admin: boolean
}

export async function getActor(db: Db, agentId: string | null | undefined): Promise<Actor | null> {
  if (!agentId) return null
  const { data } = await db.from('agents').select('id, tenant_id, role, is_platform_admin').eq('id', agentId).maybeSingle()
  return (data as Actor | null) ?? null
}

// A client's own admin may manage their tenant; the platform admin may manage any tenant.
export function canAdminTenant(actor: Actor | null, tenantId: string): boolean {
  if (!actor) return false
  return actor.is_platform_admin || (actor.role === 'admin' && actor.tenant_id === tenantId)
}
