import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAgentTenantId, NO_TENANT } from '@/lib/caller'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agentId)

  let query = db.from('tags').select('id, name, color').order('name')
  query = query.eq('tenant_id', tenantId ?? NO_TENANT)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, color, agent_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agent_id)

  const { data, error } = await db
    .from('tags')
    .insert({ name: name.trim(), color: color || '#3b82f6', ...(tenantId ? { tenant_id: tenantId } : {}) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db)
  const { error } = await db.from('tags').delete().eq('id', id).eq('tenant_id', tenantId ?? NO_TENANT)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
