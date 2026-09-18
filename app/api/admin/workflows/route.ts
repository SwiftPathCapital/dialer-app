import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  if (!agentId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agentId)
  if (!tenantId) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })

  const { data, error } = await db
    .from('dialer_workflows')
    .select('id, name, trigger_dispositions, enabled, nodes, edges, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, agent_id, trigger_dispositions, nodes, edges } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = agent_id ? await getAgentTenantId(db, agent_id) : null
  if (!tenantId) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })

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
  const { data, error } = await db.from('dialer_workflows').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('dialer_workflows').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
