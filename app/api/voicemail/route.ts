import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'

export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()

  const { data, error } = await db
    .from('voicemails')
    .select('*')
    .eq('tenant_id', caller.tenantId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, listened } = await req.json()
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()

  const { data, error } = await db
    .from('voicemails')
    .update({ listened: !!listened })
    .eq('id', id)
    .eq('tenant_id', caller.tenantId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Voicemail not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const { error } = await db.from('voicemails').delete().eq('id', id).eq('tenant_id', caller.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
