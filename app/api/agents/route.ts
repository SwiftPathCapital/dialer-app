import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('agents')
    .select('id, name, email, sip_username, sip_password, extension, status, voicemail_greeting_url, updated_at')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('agents')
    .insert({
      name: body.name,
      email: body.email,
      sip_username: body.sip_username,
      sip_password: body.sip_password,
      extension: body.extension || null,
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
