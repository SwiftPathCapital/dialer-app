import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

// Admins download the signed PDF (agents only see status). Short-lived signed URL.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden('Only admins can open signed contracts.')
  const { id } = await params
  const db = createServerClient()
  const { data: c } = await db.from('dialer_contracts').select('signed_pdf_path').eq('id', id).eq('tenant_id', caller.tenantId).maybeSingle()
  if (!c?.signed_pdf_path) return NextResponse.json({ error: 'No signed copy yet' }, { status: 404 })
  const { data, error } = await db.storage.from('contracts').createSignedUrl(c.signed_pdf_path, 120)
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Could not open the file' }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
