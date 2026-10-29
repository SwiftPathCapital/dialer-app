import type { createServerClient } from './supabase'

// Points and readings carry no tenant_id of their own; access follows their project's.

type Db = ReturnType<typeof createServerClient>

export async function projectInTenant(db: Db, projectId: string, tenantId: string): Promise<boolean> {
  const { data } = await db.from('moisture_projects').select('id').eq('id', projectId).eq('tenant_id', tenantId).maybeSingle()
  return !!data
}

export async function pointInTenant(db: Db, pointId: string, tenantId: string): Promise<boolean> {
  const { data } = await db.from('moisture_reading_points').select('project_id').eq('id', pointId).maybeSingle()
  return !!data && projectInTenant(db, data.project_id, tenantId)
}
