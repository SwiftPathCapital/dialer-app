import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()

  const { data: vms, error } = await db
    .from('voicemails')
    .select('*, dialer_calls(from_number, to_number, agent_id, direction, agents(name))')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!vms || vms.length === 0) return NextResponse.json([])

  // Enrich with lead name
  const uniqueDigits = [
    ...new Set(vms.map(v => (v.from_number || '').replace(/\D/g, '')).filter(d => d.length >= 7)),
  ]
  let leadsByDigits = new Map<string, { id: string; display: string }>()
  if (uniqueDigits.length > 0) {
    const orFilter = uniqueDigits.map(d => `phone.ilike.%${d}%`).join(',')
    const { data: leads } = await db
      .from('leads')
      .select('id, first_name, last_name, name, company_name, phone')
      .or(orFilter)
    for (const lead of leads || []) {
      const d = (lead.phone || '').replace(/\D/g, '')
      if (!d) continue
      const display =
        lead.company_name ||
        [lead.first_name, lead.last_name].filter(Boolean).join(' ') ||
        lead.name || ''
      if (display) leadsByDigits.set(d, { id: lead.id, display })
    }
  }

  return NextResponse.json(
    vms.map(v => {
      const d = (v.from_number || '').replace(/\D/g, '')
      const lead = leadsByDigits.get(d)
      return { ...v, lead_name: lead?.display ?? null, lead_id: lead?.id ?? null }
    })
  )
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

  const db = createServerClient()
  const { error } = await db.from('voicemails').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
