import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { lead_phone, disposition } = await req.json()
  const db = createServerClient()

  const digits = lead_phone.replace(/\D/g, '')

  const { data: calls } = await db
    .from('dialer_calls')
    .select('id')
    .ilike('to_number', `%${digits}%`)
    .order('started_at', { ascending: false })
    .limit(1)

  if (calls?.[0]) {
    await db.from('dialer_calls').update({ disposition }).eq('id', calls[0].id)
  }

  return NextResponse.json({ ok: true })
}
