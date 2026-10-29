import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'

// Toggle whether one calendar (or every calendar in a group) shows up on
// the requesting agent's own Calendar page. Purely a per-viewer display
// preference — has no bearing on membership/access.
export async function POST(req: NextRequest) {
  const { calendar_id, calendar_ids, visible } = await req.json()
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const agent_id = caller.id
  if (visible === undefined) {
    return NextResponse.json({ error: 'visible is required' }, { status: 400 })
  }

  const ids: string[] = calendar_ids ?? (calendar_id ? [calendar_id] : [])
  if (ids.length === 0) return NextResponse.json({ error: 'calendar_id or calendar_ids is required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db
    .from('calendar_visibility')
    .upsert(ids.map(id => ({ agent_id, calendar_id: id, visible })), { onConflict: 'agent_id,calendar_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
