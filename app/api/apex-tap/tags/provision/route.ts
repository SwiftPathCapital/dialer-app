import { NextRequest, NextResponse } from 'next/server'
import { createApexTapServerClient } from '@/lib/apexTapSupabase'

const VALID_TIERS = ['apex_tag', 'card_pro', 'biz_kit']

export async function POST(req: NextRequest) {
  const body = await req.json()
  const count = Number(body.count)
  const tier = body.tier || 'apex_tag'

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return NextResponse.json({ error: 'count must be an integer between 1 and 500' }, { status: 400 })
  }
  if (!VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: `tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 })
  }

  const db = createApexTapServerClient()
  // create_tag_batch is service_role-only by design (see apex-tap migrations) — it
  // returns claim codes in PLAINTEXT once, for printing on physical packaging. Only
  // the hash is ever persisted, so this is the only moment the code is retrievable.
  const { data, error } = await db.rpc('create_tag_batch', { p_count: count, p_tier: tier })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
