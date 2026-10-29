import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const caller = await getCaller()
  if (!caller) return unauthorized()

  const db = createServerClient()

  let query = db
    .from('moisture_projects')
    .select('id, lead_id, name, status, floor_plan_type, floor_plan_image_url, created_at, updated_at, lead:leads(id, name, first_name, last_name, company_name, phone)')
    .order('updated_at', { ascending: false })

  query = query.eq('tenant_id', caller.tenantId)
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
  const { lead_id, name } = body

  if (!lead_id || !name?.trim()) {
    return NextResponse.json({ error: 'lead_id and name are required' }, { status: 400 })
  }

  const caller = await getCaller()
  if (!caller) return unauthorized()
  const tenantId = caller.tenantId

  const db = createServerClient()
  const { data: lead } = await db.from('leads').select('id').eq('id', lead_id).eq('tenant_id', tenantId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data, error } = await db
    .from('moisture_projects')
    .insert({
      tenant_id: tenantId,
      lead_id,
      name: name.trim(),
      created_by: caller.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
