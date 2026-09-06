import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const all = searchParams.get('all') === 'true'
  const status = searchParams.get('status') || 'pending'

  const db = createServerClient()

  let query = db
    .from('dialer_callbacks')
    .select('*, agents(id, name)')
    .order('scheduled_at', { ascending: true })

  if (status !== 'all') query = query.eq('status', status)
  if (!all && agentId) query = query.eq('agent_id', agentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { lead_id, lead_phone, lead_name, agent_id, scheduled_at, notes, dialer_call_id, event_type } = body
  const type = event_type || 'callback'

  // Tasks aren't necessarily tied to a phone number; every other event type needs one.
  if ((!lead_phone && type !== 'task') || !agent_id || !scheduled_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('dialer_callbacks')
    .insert({
      lead_id: lead_id || null,
      lead_phone: lead_phone || null,
      lead_name: lead_name || null,
      agent_id,
      scheduled_at,
      notes: notes || null,
      dialer_call_id: dialer_call_id || null,
      event_type: type,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, notes, scheduled_at } = body

  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

  const db = createServerClient()
  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  if (notes !== undefined) updates.notes = notes
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at

  const { data, error } = await db
    .from('dialer_callbacks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('dialer_callbacks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
