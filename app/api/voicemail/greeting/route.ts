import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, agentInTenant, unauthorized, forbidden } from '@/lib/caller'

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const formData = await req.formData()
  const agentId = (formData.get('agentId') as string | null) || caller.id
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  if (!file.type.startsWith('audio/')) return NextResponse.json({ error: 'Greetings must be audio files' }, { status: 400 })

  const db = createServerClient()
  // Your own greeting, or (admins) a teammate's in the same account.
  if (agentId !== caller.id && (!isAdmin(caller) || !(await agentInTenant(db, agentId, caller.tenantId)))) return forbidden()
  // The extension becomes part of a storage path — keep it to plain letters/digits.
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3'
  const path = `${agentId}/greeting.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from('voicemail-greetings')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Add cache-busting so Telnyx always gets the latest file after re-upload
  const { data: { publicUrl } } = db.storage.from('voicemail-greetings').getPublicUrl(path)
  const urlWithBust = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await db
    .from('agents')
    .update({ voicemail_greeting_url: urlWithBust })
    .eq('id', agentId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ url: urlWithBust })
}
