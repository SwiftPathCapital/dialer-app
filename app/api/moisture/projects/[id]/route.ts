import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: project, error } = await db
    .from('moisture_projects')
    .select('id, lead_id, name, status, floor_plan_type, floor_plan_image_url, floor_plan_shapes, created_at, updated_at, lead:leads(id, name, first_name, last_name, company_name, phone)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: points } = await db
    .from('moisture_reading_points')
    .select('id, project_id, x, y, label, created_at')
    .eq('project_id', id)
    .order('created_at')

  if (!points?.length) return NextResponse.json({ ...project, points: [] })

  // Latest reading per point, for the pin's at-a-glance state — full history is
  // fetched separately (GET /api/moisture/points/[id]/readings) when a pin is opened.
  const { data: readings } = await db
    .from('moisture_readings')
    .select('id, point_id, moisture_level, notes, recorded_by, recorded_at')
    .in('point_id', points.map(p => p.id))
    .order('recorded_at', { ascending: false })

  type Reading = { id: string; point_id: string; moisture_level: number; notes: string | null; recorded_by: string | null; recorded_at: string }
  const latestByPoint = new Map<string, Reading>()
  for (const r of (readings ?? []) as Reading[]) {
    if (!latestByPoint.has(r.point_id)) latestByPoint.set(r.point_id, r)
  }

  return NextResponse.json({
    ...project,
    points: points.map(p => ({ ...p, latest_reading: latestByPoint.get(p.id) ?? null })),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = createServerClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = body.name
  if (body.status !== undefined) updates.status = body.status
  if (body.floor_plan_type !== undefined) updates.floor_plan_type = body.floor_plan_type
  if (body.floor_plan_image_url !== undefined) updates.floor_plan_image_url = body.floor_plan_image_url
  if (body.floor_plan_shapes !== undefined) updates.floor_plan_shapes = body.floor_plan_shapes

  const { data, error } = await db
    .from('moisture_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
