import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callerTenantId } from '@/lib/caller'

export async function GET() {
  const db = createServerClient()
  const tenantId = await callerTenantId()

  const query = db.from('lead_sources').select('id, name, enabled, created_at').order('name').eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await callerTenantId()

  const { data, error } = await db
    .from('lead_sources')
    .insert({ name: name.trim(), enabled: true, ...(tenantId ? { tenant_id: tenantId } : {}) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, enabled } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await callerTenantId()
  const { error } = await db.from('lead_sources').update({ enabled }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await callerTenantId()
  const { error } = await db.from('lead_sources').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
