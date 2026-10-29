import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAgentTenantId, NO_TENANT } from '@/lib/caller'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agentId)

  let query = db.from('voicemails').select('*').order('created_at', { ascending: false })
  query = query.eq('tenant_id', tenantId ?? NO_TENANT)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, listened } = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('voicemails')
    .update({ listened })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('voicemails').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
