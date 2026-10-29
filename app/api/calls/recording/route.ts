import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

export async function PATCH(req: NextRequest) {
  const { call_id, recording_url } = await req.json()
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const db = createServerClient()
  const { data, error } = await db
    .from('dialer_calls')
    .update({ recording_url })
    .eq('id', call_id)
    .eq('tenant_id', caller.tenantId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
