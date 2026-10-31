import { getCaller } from './caller'

export interface Actor {
  id: string
  tenant_id: string
  role: 'admin' | 'agent'
  is_platform_admin: boolean
}

// The signed-in user, as verified by proxy.ts — never an id the browser supplied.
export async function getActor(): Promise<Actor | null> {
  const caller = await getCaller()
  if (!caller) return null
  return { id: caller.id, tenant_id: caller.tenantId, role: caller.role, is_platform_admin: caller.isPlatformAdmin }
}

// A client's own admin may manage their tenant; the platform admin may manage any tenant.
export function canAdminTenant(actor: Actor | null, tenantId: string): boolean {
  if (!actor) return false
  return actor.is_platform_admin || (actor.role === 'admin' && actor.tenant_id === tenantId)
}
