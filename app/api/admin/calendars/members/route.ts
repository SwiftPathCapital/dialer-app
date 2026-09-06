import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Add (or update can_edit on) a calendar member.
export async function POST(req: NextRequest) {
  const { calendar_id, agent_id, can_edit } = await req.json()
  if (!calendar_id || !agent_id) {
    return NextResponse.json({ error: 'calendar_id and agent_id are required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('calendar_members')
    .upsert({ calendar_id, agent_id, can_edit: can_edit ?? true }, { onConflict: 'calendar_id,agent_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Toggle can_edit for an existing member.
export async function PATCH(req: NextRequest) {
  const { calendar_id, agent_id, can_edit } = await req.json()
  if (!calendar_id || !agent_id) {
    return NextResponse.json({ error: 'calendar_id and agent_id are required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('calendar_members')
    .update({ can_edit: !!can_edit })
    .eq('calendar_id', calendar_id)
    .eq('agent_id', agent_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const calendarId = searchParams.get('calendar_id')
  const agentId = searchParams.get('agent_id')
  if (!calendarId || !agentId) {
    return NextResponse.json({ error: 'calendar_id and agent_id are required' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: cal } = await db.from('calendars').select('type, owner_agent_id').eq('id', calendarId).single()
  if (cal?.type === 'personal' && cal.owner_agent_id === agentId) {
    return NextResponse.json({ error: "Can't remove the owner from their own personal calendar" }, { status: 400 })
  }

  const { error } = await db
    .from('calendar_members')
    .delete()
    .eq('calendar_id', calendarId)
    .eq('agent_id', agentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
