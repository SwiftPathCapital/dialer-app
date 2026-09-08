import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()
  const { data, error } = await db
    .from('moisture_readings')
    .select('id, point_id, moisture_level, notes, recorded_by, recorded_at')
    .eq('point_id', id)
    .order('recorded_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { agent_id, moisture_level, notes } = body

  if (moisture_level === undefined || moisture_level === null || moisture_level === '') {
    return NextResponse.json({ error: 'moisture_level is required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('moisture_readings')
    .insert({
      point_id: id,
      moisture_level,
      notes: notes || null,
      recorded_by: agent_id || null,
      // recorded_at defaults to now() server-side — this is the "auto pull date and time" behavior
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
