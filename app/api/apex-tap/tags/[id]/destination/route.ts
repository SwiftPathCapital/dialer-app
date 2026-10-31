import { NextRequest, NextResponse } from 'next/server'
import { createApexTapServerClient } from '@/lib/apexTapSupabase'
import { createServerClient } from '@/lib/supabase'
import { getCaller, canUseFeature, unauthorized, forbidden } from '@/lib/caller'

// Mirrors apex-tap's set_tag_destination RPC (insert + flip is_active, never UPDATE in
// place) but can't reuse that RPC directly — it's security invoker and checks
// auth.uid() membership, which is null under the service role. This route is the
// staff-side equivalent: authorization here is "a signed-in dialer user whose account has
// Apex Tap turned on", enforced by the dialer's own auth, not apex-tap's org membership.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!(await canUseFeature(createServerClient(), caller, '/apex-tap'))) return forbidden('Apex Tap isn\'t turned on for your account.')
  const { id } = await params
  const body = await req.json()
  const url = (body.url || '').trim()
  const type = body.type || 'link'

  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const db = createApexTapServerClient()

  const { error: deactivateError } = await db
    .from('destinations')
    .update({ is_active: false })
    .eq('tag_id', id)
    .eq('is_active', true)
  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 })

  const { data, error } = await db
    .from('destinations')
    .insert({ tag_id: id, url, type, is_active: true })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('destination_audit').insert({
    tag_id: id,
    destination_id: (data as { id: string }).id,
    action: 'set_destination_admin',
  })

  return NextResponse.json(data)
}
