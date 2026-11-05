import { createHash, randomBytes } from 'crypto'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { createServerClient } from './supabase'

// In-house e-signature. A template is plain text with {{field}} placeholders; the agent
// fills only the fields, the server renders the final text once at send time, and that
// exact text (and its SHA-256) is what the signer sees, signs and gets back as a PDF.

type Db = ReturnType<typeof createServerClient>

export const FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'date', 'email', 'phone'] as const
export type FieldType = typeof FIELD_TYPES[number]

// Lead columns a template field may be pre-filled from.
export const PREFILL_SOURCES = ['name', 'first_name', 'last_name', 'company_name', 'email', 'phone', 'state', 'city', 'requested_amount'] as const

export interface TemplateField {
  key: string
  label: string
  type: FieldType
  required: boolean
  prefill?: string | null
}

export interface ContractTemplate {
  id: string
  tenant_id: string
  name: string
  body: string
  fields: TemplateField[]
  amount_field: string | null
  enabled: boolean
}

// Filled in automatically; templates may use them without defining a field.
export const BUILT_IN_PLACEHOLDERS = ['signer_name', 'signer_email', 'signer_phone', 'business_name', 'date'] as const

export const LINK_TTL_DAYS = 30

// Shown to the signer and stored with the contract; bump the version when the wording changes.
export const CONSENT_VERSION = 'esign-consent-v1'
export function consentText(businessName: string): string {
  return [
    `By checking this box, I agree to use electronic records and electronic signatures for this document with ${businessName}, and that my electronic signature is the legal equivalent of my handwritten signature.`,
    `I understand I may request a paper copy from ${businessName}, and that I may withdraw this consent before signing by closing this page and contacting ${businessName}.`,
    'I confirm I can view this document on this device and can save or print the signed copy (PDF) that is provided after signing.',
  ].join(' ')
}

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

export function newSigningToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, tokenHash: sha256(token) }
}

export function keyFromLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field'
}

export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]))]
}

// Checks a template as an admin saves it. Returns an error message, or null when valid.
export function templateProblem(t: { name?: unknown; body?: unknown; fields?: unknown; amount_field?: unknown }): string | null {
  if (typeof t.name !== 'string' || !t.name.trim()) return 'Give the template a name.'
  if (typeof t.body !== 'string' || !t.body.trim()) return 'The contract text is empty.'
  if (!Array.isArray(t.fields)) return 'Fields must be a list.'
  const keys = new Set<string>()
  for (const f of t.fields as TemplateField[]) {
    if (!f || typeof f.key !== 'string' || !/^\w{1,40}$/.test(f.key)) return 'Every field needs a short key (letters, numbers, underscores).'
    if ((BUILT_IN_PLACEHOLDERS as readonly string[]).includes(f.key)) return `"${f.key}" is filled in automatically — pick another key.`
    if (keys.has(f.key)) return `Two fields use the key "${f.key}".`
    keys.add(f.key)
    if (typeof f.label !== 'string' || !f.label.trim()) return 'Every field needs a label.'
    if (!(FIELD_TYPES as readonly string[]).includes(f.type)) return `Unknown field type "${f.type}".`
    if (f.prefill && !(PREFILL_SOURCES as readonly string[]).includes(f.prefill)) return `Unknown pre-fill source "${f.prefill}".`
  }
  const unknown = placeholdersIn(t.body as string).filter(p => !keys.has(p) && !(BUILT_IN_PLACEHOLDERS as readonly string[]).includes(p))
  if (unknown.length) return `The text uses {{${unknown[0]}}} but there's no field with that key.`
  if (t.amount_field != null && t.amount_field !== '') {
    const f = (t.fields as TemplateField[]).find(x => x.key === t.amount_field)
    if (!f || f.type !== 'money') return 'The charge amount must be one of the template\'s money fields.'
  }
  return null
}

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// Validates and normalizes the agent's values. money → integer cents; date → YYYY-MM-DD.
export function cleanFieldValues(fields: TemplateField[], raw: Record<string, unknown>):
  { values: Record<string, string>; display: Record<string, string>; cents: Record<string, number> } | { error: string } {
  const values: Record<string, string> = {}
  const display: Record<string, string> = {}
  const cents: Record<string, number> = {}
  for (const f of fields) {
    const v = String(raw?.[f.key] ?? '').trim().slice(0, f.type === 'textarea' ? 4000 : 300)
    if (!v) {
      if (f.required) return { error: `${f.label} is required.` }
      values[f.key] = ''
      display[f.key] = ''
      continue
    }
    if (f.type === 'money') {
      const n = Number(v.replace(/[$,\s]/g, ''))
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { error: `${f.label} must be a dollar amount.` }
      cents[f.key] = Math.round(n * 100)
      values[f.key] = String(cents[f.key])
      display[f.key] = formatMoney(cents[f.key])
    } else if (f.type === 'number') {
      if (!Number.isFinite(Number(v.replace(/,/g, '')))) return { error: `${f.label} must be a number.` }
      values[f.key] = display[f.key] = v
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return { error: `${f.label} must be a date.` }
      values[f.key] = v
      display[f.key] = formatDate(v)
    } else if (f.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { error: `${f.label} must be an email address.` }
      values[f.key] = display[f.key] = v
    } else if (f.type === 'phone') {
      const d = v.replace(/\D/g, '')
      const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
      if (ten.length !== 10) return { error: `${f.label} must be a 10-digit phone number.` }
      values[f.key] = `+1${ten}`
      display[f.key] = `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
    } else {
      values[f.key] = display[f.key] = v
    }
  }
  return { values, display, cents }
}

export function renderBody(body: string, display: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => display[key] ?? '')
}

export async function logContractEvent(db: Db, e: { tenant_id: string; contract_id: string; event: string; ip?: string | null; user_agent?: string | null; detail?: Record<string, unknown> }) {
  const { error } = await db.from('dialer_contract_events').insert({ ...e, ip: e.ip ?? null, user_agent: e.user_agent ?? null, detail: e.detail ?? null })
  if (error) console.error('[contracts] could not log event', e.event, e.contract_id, error)
}

export function requestIp(headers: Headers): string | null {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
}

// A link is usable while sent/viewed and not past its expiry.
export function effectiveStatus(c: { status: string; expires_at: string }): string {
  if ((c.status === 'sent' || c.status === 'viewed') && Date.parse(c.expires_at) < Date.now()) return 'expired'
  return c.status
}

// ── Signed PDF ────────────────────────────────────────────────────────────────

// The standard PDF fonts only cover Windows-1252; swap anything else for '?' so a stray
// emoji can't make the PDF fail.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
function pdfSafe(s: string): string {
  return [...s].map(ch => {
    const c = ch.charCodeAt(0)
    if (ch === '\t') return '    '
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) return ch
    return '?'
  }).join('')
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue }
      if (line) out.push(line)
      // A single word wider than the line gets hard-broken.
      let w = word
      while (font.widthOfTextAtSize(w, size) > width) {
        let i = w.length
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--
        out.push(w.slice(0, i))
        w = w.slice(i)
      }
      line = w
    }
    out.push(line)
  }
  return out
}

export interface SignedPdfInput {
  contractId: string
  templateName: string
  businessName: string
  renderedBody: string
  bodyHash: string
  signerName: string
  signerEmail: string | null
  signerPhone: string | null
  senderName: string | null
  signatureName: string
  signaturePng: Uint8Array
  signedAt: string
  signerIp: string | null
  consent: string
  sameNetworkAsSender: boolean
  events: { event: string; at: string; ip: string | null; user_agent: string | null }[]
}

export async function buildSignedPdf(input: SignedPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(pdfSafe(input.templateName))
  pdf.setSubject(`Signed by ${pdfSafe(input.signerName)}`)
  pdf.setProducer('Apex Dialer e-signature')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 612, H = 792, M = 56, width = W - 2 * M
  const gray = rgb(0.35, 0.35, 0.35)

  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M
  const ensure = (h: number) => { if (y - h < M) { page = pdf.addPage([W, H]); y = H - M } }
  const draw = (text: string, f: PDFFont, size: number, color = rgb(0, 0, 0), gap = 4) => {
    for (const line of wrap(pdfSafe(text), f, size, width)) {
      ensure(size + gap)
      if (line) page.drawText(line, { x: M, y: y - size, size, font: f, color })
      y -= size + gap
    }
  }

  draw(input.templateName, bold, 16, rgb(0, 0, 0), 8)
  draw(input.businessName, font, 10, gray, 14)
  for (const raw of input.renderedBody.split('\n')) {
    if (raw.startsWith('# ')) { y -= 4; draw(raw.slice(2), bold, 12, rgb(0, 0, 0), 6) }
    else draw(raw, font, 10.5)
  }

  // Signature block
  y -= 16
  ensure(140)
  page.drawText('Signature', { x: M, y: y - 11, size: 11, font: bold }); y -= 20
  const img = await pdf.embedPng(input.signaturePng)
  const scale = Math.min(220 / img.width, 70 / img.height, 1)
  page.drawImage(img, { x: M, y: y - img.height * scale, width: img.width * scale, height: img.height * scale })
  y -= img.height * scale + 6
  page.drawLine({ start: { x: M, y }, end: { x: M + 260, y }, thickness: 0.7, color: gray }); y -= 14
  draw(`${input.signatureName} — signed electronically ${new Date(input.signedAt).toUTCString()}`, font, 9.5, gray)

  // Certificate page
  page = pdf.addPage([W, H]); y = H - M
  draw('Certificate of Completion', bold, 15, rgb(0, 0, 0), 10)
  const row = (k: string, v: string) => draw(`${k}: ${v}`, font, 9.5)
  row('Document', input.templateName)
  row('Document ID', input.contractId)
  row('Sent by', `${input.senderName ?? 'Unknown'} (${input.businessName})`)
  row('Signer', [input.signerName, input.signerEmail, input.signerPhone].filter(Boolean).join(' · '))
  row('Typed signature', input.signatureName)
  row('Signed at (UTC)', new Date(input.signedAt).toISOString())
  row('Signer IP address', input.signerIp ?? 'unknown')
  row('Document fingerprint (SHA-256 of the text signed)', input.bodyHash)
  if (input.sameNetworkAsSender) {
    y -= 4
    draw('Note: this document was signed from the same network (IP address) it was sent from.', bold, 9.5, rgb(0.6, 0.25, 0))
  }
  y -= 8
  draw('Electronic records and signature consent', bold, 11, rgb(0, 0, 0), 6)
  draw(input.consent, font, 9, gray)
  y -= 8
  draw('Audit trail', bold, 11, rgb(0, 0, 0), 6)
  for (const e of input.events) {
    draw(`${new Date(e.at).toISOString()}  ${e.event}${e.ip ? `  IP ${e.ip}` : ''}`, font, 9)
    if (e.user_agent) draw(`    ${e.user_agent.slice(0, 160)}`, font, 7.5, gray, 3)
  }

  return pdf.save()
}

export function decodeSignaturePng(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return null
  const b64 = dataUrl.slice('data:image/png;base64,'.length)
  if (b64.length > 400_000) return null // ~300 KB
  const bytes = Buffer.from(b64, 'base64')
  // PNG magic number
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  return new Uint8Array(bytes)
}
