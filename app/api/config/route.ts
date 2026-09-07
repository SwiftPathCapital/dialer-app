import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

const ALLOWED_KEYS = [
  'telnyx_api_key', 'telnyx_public_key', 'telnyx_sip_connection_id', 'app_url',
  'spacemail_email', 'spacemail_password',
  'spacemail_imap_host', 'spacemail_imap_port',
  'spacemail_smtp_host', 'spacemail_smtp_port',
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  let query = db.from('app_config').select('key, value, updated_at').in('key', ALLOWED_KEYS)
  if (tenantId) query = query.eq('tenant_id', tenantId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return a map of key → { isSet, updated_at } — never expose raw values to client
  const result: Record<string, { isSet: boolean; updated_at: string | null }> = {}
  for (const key of ALLOWED_KEYS) {
    const row = data?.find(r => r.key === key)
    result[key] = { isSet: !!(row?.value), updated_at: row?.updated_at ?? null }
  }

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { agent_id, ...body }: Record<string, string> = await req.json()
  const db = createServerClient()
  const tenantId = agent_id ? await getAgentTenantId(db, agent_id) : null

  const updates = Object.entries(body)
    .filter(([key]) => ALLOWED_KEYS.includes(key))
    .filter(([, value]) => value !== undefined)

  if (updates.length === 0) return NextResponse.json({ ok: true })

  const rows = updates.map(([key, value]) => ({
    key,
    value: value || null,
    updated_at: new Date().toISOString(),
    ...(tenantId ? { tenant_id: tenantId } : {}),
  }))

  // app_config's primary key is (tenant_id, key) — without tenant_id explicitly here,
  // onConflict would need to target the column that actually carries the DEFAULT, which
  // upsert can't resolve, so a tenant_id is required for this to correctly update-in-place
  // rather than erroring on the missing conflict target.
  if (!tenantId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

  const { error } = await db
    .from('app_config')
    .upsert(rows, { onConflict: 'tenant_id,key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
