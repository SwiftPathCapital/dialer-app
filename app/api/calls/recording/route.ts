import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const { call_id, recording_url } = await req.json()
  const db = createServerClient()
  const { error } = await db
    .from('dialer_calls')
    .update({ recording_url })
    .eq('id', call_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
