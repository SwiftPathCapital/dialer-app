import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Deterministic per-agent shuffle so no two agents start on the same lead.
// Uses the agent's UUID as a seed → same agent always gets the same order,
// different agents always get a different order.
function agentSeed(agentId: string): number {
  let h = 0
  for (let i = 0; i < agentId.length; i++) h = Math.imul(31, h) + agentId.charCodeAt(i) | 0
  return h >>> 0
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed | 1
  const rand = () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

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

      // Exclude leads called in the last 8 hours from the dialer queue
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
      query = query.or(`last_called_at.is.null,last_called_at.lt.${eightHoursAgo}`)
    }
    if (search) {
      query = query.or(`company_name.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Shuffle the dialer queue per agent so they don't all start on the same lead
  const result = (agentId && !phone && !search)
    ? seededShuffle(data ?? [], agentSeed(agentId))
    : (data ?? [])

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  const db = createServerClient()
  const { error } = await db.from('leads').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('leads')
    .insert({
      phone:          body.phone          || null,
      first_name:     body.first_name     || null,
      last_name:      body.last_name      || null,
      company_name:   body.company_name   || null,
      email:          body.email          || null,
      lead_type_label:body.lead_source    || null,
      lead_type:      body.lead_source    || null,
      why_funds:      body.notes          || null,
      status:         'New',
      assigned_to:    body.agent_id       || null,
      created_at:     new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
