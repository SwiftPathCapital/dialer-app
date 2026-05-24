import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const ALLOWED_KEYS = ['telnyx_api_key', 'telnyx_public_key', 'telnyx_sip_connection_id', 'app_url']

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('app_config')
    .select('key, value, updated_at')
    .in('key', ALLOWED_KEYS)

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
  const body: Record<string, string> = await req.json()
  const db = createServerClient()

  const updates = Object.entries(body)
    .filter(([key]) => ALLOWED_KEYS.includes(key))
    .filter(([, value]) => value !== undefined)

  if (updates.length === 0) return NextResponse.json({ ok: true })

  const rows = updates.map(([key, value]) => ({
    key,
    value: value || null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await db
    .from('app_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
