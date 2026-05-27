import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * GET /api/calls/cooldown?phone=<digits>
 * Returns { blocked: false } or { blocked: true, until: '<ISO>' }
 *
 * A lead is blocked for 8 hours after the last time it was dispositioned
 * (last_called_at is re-stamped at disposition time, not just call start).
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') || ''
  const digits = phone.replace(/\D/g, '')

  if (digits.length < 7) return NextResponse.json({ blocked: false })

  const db = createServerClient()
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()

  const { data: lead } = await db
    .from('leads')
    .select('id, last_called_at')
    .ilike('phone', `%${digits}%`)
    .not('last_called_at', 'is', null)
    .gt('last_called_at', eightHoursAgo)
    .limit(1)
    .maybeSingle()

  if (!lead?.last_called_at) return NextResponse.json({ blocked: false })

  const until = new Date(new Date(lead.last_called_at).getTime() + 8 * 60 * 60 * 1000)
  return NextResponse.json({ blocked: true, until: until.toISOString() })
}
