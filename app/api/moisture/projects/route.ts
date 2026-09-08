import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const leadId = searchParams.get('lead_id')

  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  let query = db
    .from('moisture_projects')
    .select('id, lead_id, name, status, floor_plan_type, floor_plan_image_url, created_at, updated_at, lead:leads(id, name, first_name, last_name, company_name, phone)')
    .order('updated_at', { ascending: false })

  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (leadId) query = query.eq('lead_id', leadId)

  const { data: projects, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!projects?.length) return NextResponse.json([])

  // Attach a reading-point count per project for the list view (one extra query, not N+1)
  const { data: points } = await db
    .from('moisture_reading_points')
    .select('project_id')
    .in('project_id', projects.map(p => p.id))
  const countByProject = new Map<string, number>()
  for (const p of points ?? []) {
    countByProject.set(p.project_id, (countByProject.get(p.project_id) ?? 0) + 1)
  }

  return NextResponse.json(
    projects.map(p => ({ ...p, reading_point_count: countByProject.get(p.id) ?? 0 }))
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { agent_id, lead_id, name } = body

  if (!lead_id || !name?.trim()) {
    return NextResponse.json({ error: 'lead_id and name are required' }, { status: 400 })
  }

  const db = createServerClient()
  const tenantId = agent_id ? await getAgentTenantId(db, agent_id) : null
  if (!tenantId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

  const { data, error } = await db
    .from('moisture_projects')
    .insert({
      tenant_id: tenantId,
      lead_id,
      name: name.trim(),
      created_by: agent_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
