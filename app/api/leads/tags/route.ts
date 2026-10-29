import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized, type Caller } from '@/lib/caller'

type Db = ReturnType<typeof createServerClient>

// Both the lead and the tag must belong to the caller's account.
async function bothInTenant(db: Db, caller: Caller, leadId: string, tagId: string): Promise<boolean> {
  const [{ data: lead }, { data: tag }] = await Promise.all([
    db.from('leads').select('id').eq('id', leadId).eq('tenant_id', caller.tenantId).maybeSingle(),
    db.from('tags').select('id').eq('id', tagId).eq('tenant_id', caller.tenantId).maybeSingle(),
  ])
  return !!lead && !!tag
}

export async function POST(req: NextRequest) {
  const { lead_id, tag_id } = await req.json()
  if (!lead_id || !tag_id) return NextResponse.json({ error: 'lead_id and tag_id are required' }, { status: 400 })
  const caller = await getCaller()
  if (!caller) return unauthorized()

  const db = createServerClient()
  if (!(await bothInTenant(db, caller, lead_id, tag_id))) return NextResponse.json({ error: 'Lead or tag not found' }, { status: 404 })
  const { error } = await db.from('lead_tags').upsert({ lead_id, tag_id }, { onConflict: 'lead_id,tag_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const tagId = searchParams.get('tag_id')
  if (!leadId || !tagId) return NextResponse.json({ error: 'lead_id and tag_id required' }, { status: 400 })
  const caller = await getCaller()
  if (!caller) return unauthorized()

  const db = createServerClient()
  if (!(await bothInTenant(db, caller, leadId, tagId))) return NextResponse.json({ error: 'Lead or tag not found' }, { status: 404 })
  const { error } = await db.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
