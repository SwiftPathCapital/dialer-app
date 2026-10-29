import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'
import { projectInTenant } from '@/lib/moistureAccess'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Floor plans must be images' }, { status: 400 })

  const db = createServerClient()
  if (!(await projectInTenant(db, id, caller.tenantId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // The extension becomes part of a storage path — keep it to plain letters/digits.
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${id}/floor-plan.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from('moisture-floor-plans')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = db.storage.from('moisture-floor-plans').getPublicUrl(path)
  const urlWithBust = `${publicUrl}?v=${Date.now()}`

  const { data, error } = await db
    .from('moisture_projects')
    .update({ floor_plan_type: 'image', floor_plan_image_url: urlWithBust, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', caller.tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
