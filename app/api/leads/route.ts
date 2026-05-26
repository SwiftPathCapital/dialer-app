import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const phone = searchParams.get('phone') || ''
  const search = searchParams.get('search') || ''
  const limit = parseInt(searchParams.get('limit') || '100')

  const db = createServerClient()

  let query = db
    .from('leads')
    .select('id, name, first_name, last_name, phone, company_name, email, state, city, status, lead_type, lead_type_label, assigned_to, created_at, revenue, monthly_deposit, requested_amount, tib, fico, employee_size, why_funds')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (phone) {
    query = query.ilike('phone', `%${phone}%`)
  } else {
    if (agentId) {
      query = query.or(`assigned_to.eq.${agentId},assigned_to.is.null`)

      // Filter by active lead sources when loading the dialer queue
      const { data: configRow } = await db
        .from('app_config')
        .select('value')
        .eq('key', 'dialer_lead_sources')
        .single()

      let activeSources: string[] = []
      try { activeSources = JSON.parse(configRow?.value ?? '[]') } catch { activeSources = [] }

      if (activeSources.length > 0) {
        // Supabase .in() doesn't trim, so include all trimmed variants
        query = query.in('lead_type', activeSources)
      }
    }
    if (search) {
      query = query.or(`company_name.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  const db = createServerClient()
  const { error } = await db.from('leads').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
