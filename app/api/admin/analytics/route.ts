import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function rangeStart(range: string): string {
  const now = new Date()
  if (range === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString()
  }
  if (range === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
  if (range === 'month') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }
  return '1970-01-01T00:00:00.000Z' // all time
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get('range') || 'today'
  const db = createServerClient()

  const { data: calls } = await db
    .from('dialer_calls')
    .select('direction, disposition, status')
    .gte('started_at', rangeStart(range))

  if (!calls) return NextResponse.json({ error: 'Query failed' }, { status: 500 })

  const tally = (subset: typeof calls) => {
    const counts: Record<string, number> = {}
    for (const c of subset) {
      const key = c.disposition || 'No Disposition'
      counts[key] = (counts[key] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([disposition, count]) => ({ disposition, count }))
  }

  const inbound = calls.filter(c => c.direction === 'inbound')
  const outbound = calls.filter(c => c.direction === 'outbound')
  const dispositioned = calls.filter(c => c.disposition)

  return NextResponse.json({
    range,
    totals: {
      all: calls.length,
      inbound: inbound.length,
      outbound: outbound.length,
      dispositioned: dispositioned.length,
    },
    byDisposition: {
      all: tally(calls),
      inbound: tally(inbound),
      outbound: tally(outbound),
    },
  })
}
