import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Statuses that permanently remove a lead from the dialing queue
const DEAD = new Set(['DNC', 'Not Interested', 'Wrong Number'])
// Statuses that mean the lead is in the sales pipeline (app sent or further)
const PIPELINE = new Set(['App Received', 'Docs Received', 'Pending App & Docs', 'Deal Funded'])

export interface LeadSourceRow {
  lead_type: string
  total: number
  dialable: number       // not dead, not in pipeline
  pipeline: number       // app stage or further
  dead: number           // DNC / Not Interested / Wrong Number
  by_status: Record<string, number>
}

export async function GET() {
  const db = createServerClient()

  const { data, error } = await db
    .from('leads')
    .select('lead_type, lead_type_label, status')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json([])

  // Group by lead_type
  const map = new Map<string, LeadSourceRow>()

  for (const row of data) {
    const key = row.lead_type || 'Unknown'
    if (!map.has(key)) {
      map.set(key, { lead_type: key, total: 0, dialable: 0, pipeline: 0, dead: 0, by_status: {} })
    }
    const entry = map.get(key)!
    const status = row.status || 'New'

    entry.total++
    entry.by_status[status] = (entry.by_status[status] || 0) + 1

    if (DEAD.has(status)) {
      entry.dead++
    } else if (PIPELINE.has(status)) {
      entry.pipeline++
    } else {
      entry.dialable++
    }
  }

  // Sort by total desc
  const result = Array.from(map.values()).sort((a, b) => b.total - a.total)
  return NextResponse.json(result)
}
