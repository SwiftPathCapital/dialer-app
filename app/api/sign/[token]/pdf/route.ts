import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sha256 } from '@/lib/contracts'
import { ensureSignedPdf } from '@/lib/contractPdf'

// PUBLIC — the signer downloads their signed copy with the same link they signed with.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createServerClient()
  const { data: c } = await db.from('dialer_contracts').select('id, status, template_name').eq('token_hash', sha256(token)).maybeSingle()
  if (!c || c.status !== 'signed') return NextResponse.json({ error: 'No signed copy for this link.' }, { status: 404 })
  const path = await ensureSignedPdf(db, c.id)
  if (!path) return NextResponse.json({ error: 'The signed copy isn\'t ready yet. Try again in a minute.' }, { status: 503 })
  const { data, error } = await db.storage.from('contracts').download(path)
  if (error || !data) return NextResponse.json({ error: 'Could not load the signed copy.' }, { status: 500 })
  const name = `${c.template_name.replace(/[^\w\- ]+/g, '').trim() || 'contract'} - signed.pdf`
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
}
