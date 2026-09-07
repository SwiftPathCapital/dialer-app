import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { agentId, password, admin_agent_id } = await req.json()

  if (!agentId || !password) {
    return NextResponse.json({ error: 'agentId and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = createServerClient()

  // Resetting another user's password is high-stakes — verify the caller is an admin
  // and, unless they're the platform admin, that the target agent is in their own tenant.
  // Without this, any caller who knows an agentId could reset any tenant's login.
  if (!admin_agent_id) {
    return NextResponse.json({ error: 'admin_agent_id is required' }, { status: 400 })
  }
  const { data: caller } = await db.from('agents').select('role, is_platform_admin, tenant_id').eq('id', admin_agent_id).single()
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!caller.is_platform_admin) {
    const { data: target } = await db.from('agents').select('tenant_id').eq('id', agentId).single()
    if (!target || target.tenant_id !== caller.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error } = await db.auth.admin.updateUserById(agentId, { password })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
