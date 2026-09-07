import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') || ''
  if (!phone) return NextResponse.json({ name: null })

  const db = createServerClient()
  const digits = phone.replace(/\D/g, '')

  const agentId = req.nextUrl.searchParams.get('agent_id')
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  // 1. Check our own leads table first — free and fast
  let leadsQuery = db
    .from('leads')
    .select('first_name, last_name, company_name, name')
    .ilike('phone', `%${digits.slice(-10)}%`)
    .limit(1)
  if (tenantId) leadsQuery = leadsQuery.eq('tenant_id', tenantId)
  const { data: leads } = await leadsQuery

  if (leads && leads.length > 0) {
    const l = leads[0]
    const name =
      l.company_name ||
      [l.first_name, l.last_name].filter(Boolean).join(' ') ||
      l.name ||
      null
    if (name) return NextResponse.json({ name, source: 'db' })
  }

  // 2. Fall back to Telnyx CNAM lookup (only works for US numbers)
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null
  if (!e164) return NextResponse.json({ name: null })

  const { data: config } = await db
    .from('app_config')
    .select('value')
    .eq('key', 'telnyx_api_key')
    .single()

  const apiKey = config?.value
  if (!apiKey) return NextResponse.json({ name: null })

  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/phone_number_lookups/${encodeURIComponent(e164)}?type=caller-name`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return NextResponse.json({ name: null })
    const data = await res.json()
    const cnam: string | null = data?.data?.caller_name?.caller_name ?? null
    // Telnyx returns "NOT AVAILABLE" or blank when CNAM has no record
    if (cnam && cnam !== 'NOT AVAILABLE' && cnam.trim()) {
      return NextResponse.json({ name: cnam, source: 'cnam' })
    }
  } catch {
    // CNAM lookup failure is non-fatal
  }

  return NextResponse.json({ name: null })
}
