import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'
import { templateProblem, type TemplateField } from '@/lib/contracts'

// Contract templates for the caller's account (proxy.ts restricts /api/admin/* to admins).

const COLUMNS = 'id, name, body, fields, amount_field, enabled, created_at, updated_at'

function normalize(body: Record<string, unknown>) {
  const fields = Array.isArray(body.fields)
    ? (body.fields as TemplateField[]).map(f => ({
        key: String(f.key ?? '').trim(),
        label: String(f.label ?? '').trim().slice(0, 80),
        type: f.type,
        required: !!f.required,
        prefill: f.prefill || null,
      }))
    : body.fields
  return {
    name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : body.name,
    body: typeof body.body === 'string' ? body.body.slice(0, 50_000) : body.body,
    fields,
    amount_field: body.amount_field ? String(body.amount_field) : null,
  }
}

export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const { data, error } = await db
    .from('dialer_contract_templates')
    .select(COLUMNS)
    .eq('tenant_id', caller.tenantId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const t = normalize(await req.json().catch(() => ({})))
  const problem = templateProblem(t)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const db = createServerClient()
  const { data, error } = await db
    .from('dialer_contract_templates')
    .insert({ ...t, tenant_id: caller.tenantId, created_by: caller.actingAs ? null : caller.id })
    .select(COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const raw = await req.json().catch(() => ({}))
  if (!raw.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const db = createServerClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof raw.enabled === 'boolean') updates.enabled = raw.enabled
  if ('name' in raw || 'body' in raw || 'fields' in raw || 'amount_field' in raw) {
    const t = normalize(raw)
    const problem = templateProblem(t)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    Object.assign(updates, t)
  }

  const { data, error } = await db
    .from('dialer_contract_templates')
    .update(updates)
    .eq('id', raw.id)
    .eq('tenant_id', caller.tenantId)
    .select(COLUMNS)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  return NextResponse.json(data)
}

// Sent contracts keep their own copy of the text, so deleting a template never changes them.
export async function DELETE(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const db = createServerClient()
  const { error } = await db.from('dialer_contract_templates').delete().eq('id', id).eq('tenant_id', caller.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
