import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()

  const [typesRes, configRes] = await Promise.all([
    db.from('leads').select('lead_type').not('lead_type', 'is', null),
    db.from('app_config').select('value').eq('key', 'dialer_lead_sources').single(),
  ])

  // Distinct trimmed lead types
  const seen = new Set<string>()
  const types: string[] = []
  for (const row of typesRes.data ?? []) {
    const t = (row.lead_type as string).trim()
    if (t && !seen.has(t)) { seen.add(t); types.push(t) }
  }
  types.sort()

  let active: string[] = []
  try { active = JSON.parse(configRes.data?.value ?? '[]') } catch { active = [] }

  return NextResponse.json({ types, active })
}

export async function POST(req: NextRequest) {
  const { sources } = await req.json()
  if (!Array.isArray(sources)) return NextResponse.json({ error: 'sources must be an array' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('app_config').upsert(
    { key: 'dialer_lead_sources', value: JSON.stringify(sources), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
