import { NextRequest, NextResponse } from 'next/server'
import { createApexTapServerClient } from '@/lib/apexTapSupabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  const db = createApexTapServerClient()

  let query = db
    .from('tags')
    .select('id, slug, status, tier, created_at, claimed_at, org_id, orgs(name), destinations(url, is_active, created_at)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (status) query = query.eq('status', status)
  if (search) query = query.or(`slug.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flattened = (data ?? []).map((row: any) => {
    const { orgs, destinations, ...rest } = row
    const activeUrl = (destinations ?? []).find((d: { is_active: boolean }) => d.is_active)?.url ?? null
    return { ...rest, org_name: orgs?.name ?? null, active_url: activeUrl }
  })

  return NextResponse.json(flattened)
}
