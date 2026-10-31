import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

export async function POST(req: NextRequest) {
  const { agentId, password } = await req.json()

  if (!agentId || !password) {
    return NextResponse.json({ error: 'agentId and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = createServerClient()

  // Resetting another user's password: the signed-in caller must be an admin of the
  // target's tenant (or the platform admin).
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  if (!caller.isPlatformAdmin) {
    const { data: target } = await db.from('agents').select('tenant_id').eq('id', agentId).maybeSingle()
    if (!target || target.tenant_id !== caller.tenantId) return forbidden()
  }

  const { error } = await db.auth.admin.updateUserById(agentId, { password })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
