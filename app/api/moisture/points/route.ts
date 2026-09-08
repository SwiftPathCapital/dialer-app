import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { project_id, x, y, label } = body

  if (!project_id || x === undefined || y === undefined) {
    return NextResponse.json({ error: 'project_id, x, and y are required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('moisture_reading_points')
    .insert({ project_id, x, y, label: label || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
