import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callerTenantId } from '@/lib/caller'

export async function GET() {
  const db = createServerClient()
  const tenantId = await callerTenantId()

  const { data, error } = await db
    .from('dialer_workflows')
    .select('id, name, trigger_dispositions, enabled, nodes, edges, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, trigger_dispositions, nodes, edges } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await callerTenantId()

  const { data, error } = await db
    .from('dialer_workflows')
    .insert({
      name: name.trim(),
      tenant_id: tenantId,
      trigger_dispositions: trigger_dispositions || [],
      nodes: nodes || [],
      edges: edges || [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, name, enabled, trigger_dispositions, nodes, edges } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (enabled !== undefined) updates.enabled = enabled
  if (trigger_dispositions !== undefined) updates.trigger_dispositions = trigger_dispositions
  if (nodes !== undefined) updates.nodes = nodes
  if (edges !== undefined) updates.edges = edges

  const db = createServerClient()
  const tenantId = await callerTenantId()
  const { data, error } = await db.from('dialer_workflows').update(updates).eq('id', id).eq('tenant_id', tenantId).select().maybeSingle()
  if (!error && !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await callerTenantId()
  const { error } = await db.from('dialer_workflows').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
