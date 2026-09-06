import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { lead_id, tag_id } = await req.json()
  if (!lead_id || !tag_id) return NextResponse.json({ error: 'lead_id and tag_id are required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('lead_tags').upsert({ lead_id, tag_id }, { onConflict: 'lead_id,tag_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const tagId = searchParams.get('tag_id')
  if (!leadId || !tagId) return NextResponse.json({ error: 'lead_id and tag_id required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
