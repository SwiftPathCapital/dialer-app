import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized, forbidden } from '@/lib/caller'

// POST { tenant_id } — the platform admin switches into another account (tenant_id = null
// switches back). The switch itself lives in the browser (lib/actAs.ts sends the
// x-act-as-tenant header and proxy.ts re-checks it on every request); this endpoint
// validates the target and records the switch in the server log.
export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!caller.isPlatformAdmin) return forbidden()
  const { tenant_id } = await req.json().catch(() => ({}))

  if (!tenant_id || tenant_id === caller.homeTenantId) {
    console.info(`[act-as] ${caller.id} returned to own account ${caller.homeTenantId}`)
    return NextResponse.json({ tenant: null })
  }

  const db = createServerClient()
  const { data: tenant } = await db.from('tenants').select('id, name, slug, hidden_features').eq('id', tenant_id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  console.info(`[act-as] ${caller.id} switched into ${tenant.id} (${tenant.name})`)
  return NextResponse.json({ tenant })
}
