import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  let query = db
    .from('agents')
    .select('id, name, email, sip_username, sip_password, extension, did, status, voicemail_greeting_url, can_view_all_leads, hidden_features, updated_at')
    .order('name')
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()

  // New agents inherit the creating admin's tenant — falls back to the schema default
  // (today's single tenant) if the caller doesn't pass one, same as every other insert path.
  const tenantId = body.agent_id ? await getAgentTenantId(db, body.agent_id) : null

  const { data, error } = await db
    .from('agents')
    .insert({
      name: body.name,
      email: body.email,
      sip_username: body.sip_username,
      sip_password: body.sip_password,
      extension: body.extension || null,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  const db = createServerClient()

  const { data, error } = await db
    .from('agents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
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
  const { error } = await db.from('agents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
