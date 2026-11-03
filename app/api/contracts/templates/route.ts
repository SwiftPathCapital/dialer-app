import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'
import { isEmailConfigured } from '@/lib/email'

// Templates an agent can send: name and fill-in fields only — never the contract text.
export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const { data, error } = await db
    .from('dialer_contract_templates')
    .select('id, name, fields, amount_field')
    .eq('tenant_id', caller.tenantId)
    .eq('enabled', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [], email_available: isEmailConfigured() })
}
