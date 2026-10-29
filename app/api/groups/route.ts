import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

const EDITABLE = ['name', 'phone_number', 'voicemail_enabled', 'color', 'script_enabled', 'script_text']

export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()

  const { data, error } = await db
    .from('inbound_groups')
    .select('*, inbound_group_members(agent_id, agents(id, name, email))')
    .eq('tenant_id', caller.tenantId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('inbound_groups')
    .insert({
      name: body.name,
      phone_number: body.phone_number || null,
      voicemail_enabled: body.voicemail_enabled ?? true,
      tenant_id: caller.tenantId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const { id, members, ...requested } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = createServerClient()

  const { data: group } = await db.from('inbound_groups').select('id').eq('id', id).eq('tenant_id', caller.tenantId).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(requested)) {
    if (!EDITABLE.includes(k)) return forbidden(`You can't change ${k}.`)
    updates[k] = v
  }

  // Only run update() when there are actual fields to change — Supabase rejects update({})
  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('inbound_groups').update(updates).eq('id', id).eq('tenant_id', caller.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sync members if provided — only agents in this account can be added.
  if (Array.isArray(members)) {
    let memberIds: string[] = []
    if (members.length > 0) {
      const { data: inTenant } = await db.from('agents').select('id').in('id', members).eq('tenant_id', caller.tenantId)
      memberIds = (inTenant ?? []).map(a => a.id)
      if (memberIds.length !== new Set(members).size) return forbidden('One or more agents are not in this account.')
    }
    await db.from('inbound_group_members').delete().eq('group_id', id)
    if (memberIds.length > 0) {
      await db.from('inbound_group_members').insert(
        memberIds.map(agent_id => ({ group_id: id, agent_id }))
      )
    }
  }

  const { data, error } = await db.from('inbound_groups').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('inbound_groups').delete().eq('id', id).eq('tenant_id', caller.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
