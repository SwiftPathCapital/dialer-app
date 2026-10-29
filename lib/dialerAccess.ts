import { getActor, canAdminTenant, type Actor } from './authz'

// Resolves which tenant a dialer-settings request is about. Only the platform admin may
// name another tenant explicitly; everyone else always gets their own.
export async function resolveTargetTenant(
  requestedTenantId: string | null | undefined,
  { requireAdmin }: { requireAdmin: boolean },
): Promise<{ actor: Actor; tenantId: string } | { error: string; status: number }> {
  const actor = await getActor()
  if (!actor) return { error: 'Please sign in again.', status: 401 }
  const tenantId = requestedTenantId && actor.is_platform_admin ? requestedTenantId : actor.tenant_id
  if (requireAdmin && !canAdminTenant(actor, tenantId)) return { error: 'Admins only', status: 403 }
  return { actor, tenantId }
}
