import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id') || ''
  const limit = parseInt(searchParams.get('limit') || '200')

  const db = createServerClient()

  let query = db
    .from('dialer_calls')
    .select('*, agents(id, name, email)')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (agentId) query = query.eq('agent_id', agentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
