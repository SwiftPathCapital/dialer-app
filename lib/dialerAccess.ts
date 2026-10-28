import type { createServerClient } from './supabase'
import { getActor, canAdminTenant, type Actor } from './authz'

type Db = ReturnType<typeof createServerClient>

// Resolves which tenant a dialer-settings request is about. Only the platform admin may
// name another tenant explicitly; everyone else always gets their own.
export async function resolveTargetTenant(
  db: Db,
  agentId: string | null | undefined,
  requestedTenantId: string | null | undefined,
  { requireAdmin }: { requireAdmin: boolean },
): Promise<{ actor: Actor; tenantId: string } | { error: string; status: number }> {
  const actor = await getActor(db, agentId)
  if (!actor) return { error: 'Unknown agent', status: 404 }
  const tenantId = requestedTenantId && actor.is_platform_admin ? requestedTenantId : actor.tenant_id
  if (requireAdmin && !canAdminTenant(actor, tenantId)) return { error: 'Admins only', status: 403 }
  return { actor, tenantId }
}
