import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAgentTenantId, agentInTenant } from '@/lib/caller'

type Db = ReturnType<typeof createServerClient>

// Both the calendar and the agent must belong to the caller's tenant.
async function guard(db: Db, calendarId: string, agentId: string) {
  const tenantId = await getAgentTenantId(db)
  if (!tenantId) return { error: NextResponse.json({ error: 'Unknown account' }, { status: 400 }) }
  const { data: cal } = await db.from('calendars').select('id, type, owner_agent_id').eq('id', calendarId).eq('tenant_id', tenantId).maybeSingle()
  if (!cal) return { error: NextResponse.json({ error: 'Calendar not found' }, { status: 404 }) }
  if (!(await agentInTenant(db, agentId, tenantId))) return { error: NextResponse.json({ error: 'That person isn\'t in your account' }, { status: 400 }) }
  return { cal }
}

// Add (or update can_edit on) a calendar member.
export async function POST(req: NextRequest) {
  const { calendar_id, agent_id, can_edit } = await req.json()
  if (!calendar_id || !agent_id) {
    return NextResponse.json({ error: 'calendar_id and agent_id are required' }, { status: 400 })
  }

  const db = createServerClient()
  const g = await guard(db, calendar_id, agent_id)
  if (g.error) return g.error

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
  const g = await guard(db, calendar_id, agent_id)
  if (g.error) return g.error

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
  const g = await guard(db, calendarId, agentId)
  if (g.error) return g.error
  if (g.cal.type === 'personal' && g.cal.owner_agent_id === agentId) {
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
