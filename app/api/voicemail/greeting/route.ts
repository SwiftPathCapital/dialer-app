import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const agentId = formData.get('agentId') as string
  const file = formData.get('file') as File

  if (!agentId || !file) {
    return NextResponse.json({ error: 'agentId and file required' }, { status: 400 })
  }

  const db = createServerClient()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3'
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
