'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, Copy, Check, RefreshCw, Trash2, AlertTriangle, Loader2, Pencil } from 'lucide-react'

interface DnsRecord { record: string; name: string; type: string; value: string; ttl?: string | number; priority?: number; status?: string }
interface Sender {
  domain: string
  from_name: string
  from_local: string
  reply_to: string | null
  status: string
  dns_records: DnsRecord[]
  last_checked_at: string | null
  verified_at: string | null
}

const cardCls = 'bg-gray-800 rounded-xl border border-gray-700 p-5'
const inputCls = 'w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'
const labelCls = 'text-gray-400 text-xs block mb-1'

const STATUS: Record<string, { label: string; cls: string }> = {
  verified: { label: 'Verified: sending', cls: 'bg-green-900/50 text-green-300 border-green-700/50' },
  pending: { label: 'Checking DNS…', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  not_started: { label: 'Waiting for DNS records', cls: 'bg-gray-700 text-gray-300 border-gray-600' },
  partially_verified: { label: 'Partly verified', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  partially_failed: { label: 'Some records failed', cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
  failed: { label: 'Verification failed', cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
  temporary_failure: { label: 'Temporarily failing', cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
}

const RECORD_STATUS: Record<string, string> = { not_started: 'Not found yet', pending: 'Checking', verified: 'Verified', failed: 'Failed', temporary_failure: 'Failing' }

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {}) }}
      className="text-gray-500 hover:text-white shrink-0"
    >
      {done ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export default function EmailSenderPanel({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [sender, setSender] = useState<Sender | null>(null)
  const [apiKeySet, setApiKeySet] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'' | 'add' | 'verify' | 'save' | 'remove'>('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ domain: '', from_name: tenantName, from_local: 'hello', reply_to: '' })

  const api = '/api/platform/email-sender'

  const load = useCallback(async () => {
    const res = await fetch(`${api}?tenant_id=${encodeURIComponent(tenantId)}`).catch(() => null)
    const d = await res?.json().catch(() => null)
    if (!res?.ok) { setError(d?.error || 'Could not load email settings.'); setLoaded(true); return }
    setSender(d.sender)
    setApiKeySet(!!d.api_key_set)
    if (d.refresh_error) setError(`Couldn't check the latest status: ${d.refresh_error}`)
    setLoaded(true)
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function call(method: string, body?: object, kind: typeof busy = '') {
    setBusy(kind); setError('')
    const url = method === 'DELETE' ? `${api}?tenant_id=${encodeURIComponent(tenantId)}` : api
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify({ tenant_id: tenantId, ...body }) : undefined,
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setBusy('')
    if (!res?.ok) { setError(d?.error || 'Something went wrong.'); return null }
    return d
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const d = await call('POST', form, 'add')
    if (d) setSender(d.sender)
  }

  async function verify() {
    const d = await call('PATCH', { action: 'verify' }, 'verify')
    if (d) setSender(d.sender)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    const d = await call('PATCH', { action: 'update', from_name: form.from_name, from_local: form.from_local, reply_to: form.reply_to }, 'save')
    if (d) { setSender(d.sender); setEditing(false) }
  }

  async function remove() {
    if (!sender || !confirm(`Remove ${sender.domain}? ${tenantName} stops sending email until a domain is added again.`)) return
    const d = await call('DELETE', undefined, 'remove')
    if (d) { setSender(null); setForm({ domain: '', from_name: tenantName, from_local: 'hello', reply_to: '' }) }
  }

  const fromPreview = (name: string, local: string, domain: string) => `${name || tenantName} <${local || 'hello'}@${domain || 'yourdomain.com'}>`

  const senderFields = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor={`es-name-${tenantId}`}>Sender name</label>
          <input id={`es-name-${tenantId}`} value={form.from_name} onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`es-local-${tenantId}`}>From address</label>
          <div className="flex items-center gap-1">
            <input id={`es-local-${tenantId}`} value={form.from_local} onChange={e => setForm(f => ({ ...f, from_local: e.target.value }))} className={inputCls} />
            <span className="text-gray-400 text-sm shrink-0">@{sender?.domain || form.domain || 'domain'}</span>
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor={`es-reply-${tenantId}`}>Reply-to (optional)</label>
        <input id={`es-reply-${tenantId}`} type="email" value={form.reply_to} onChange={e => setForm(f => ({ ...f, reply_to: e.target.value }))} placeholder="office@theirdomain.com" className={inputCls} />
        <p className="text-gray-600 text-xs mt-1">Contracts and workflow emails reply to the sending agent when their login has an email. Otherwise replies go here.</p>
      </div>
    </>
  )

  if (!loaded) return <div className={cardCls}><p className="text-gray-500 text-sm">Loading email settings…</p></div>

  const st = sender ? (STATUS[sender.status] || { label: sender.status, cls: 'bg-gray-700 text-gray-300 border-gray-600' }) : null

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-4 h-4 text-cyan-400" />
        <p className="text-white font-semibold text-sm">Email sending — {tenantName}</p>
        {st && <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>}
      </div>
      <p className="text-gray-500 text-xs mb-4">
        {`Contracts, workflow emails and scheduled reports for ${tenantName} go out from the client's own domain once it's verified.`}
      </p>

      {!apiKeySet && (
        <p className="mb-4 text-amber-300 text-xs flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Add the Resend API key in Admin → Config first.</p>
      )}
      {error && <p className="mb-3 text-red-400 text-sm">{error}</p>}

      {!sender ? (
        <form onSubmit={add} className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`es-domain-${tenantId}`}>Client&apos;s domain</label>
            <input id={`es-domain-${tenantId}`} value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="sunlightcontractors.com" className={inputCls} />
            <p className="text-gray-600 text-xs mt-1">The client needs access to this domain&apos;s DNS (GoDaddy, Cloudflare, etc.) to add a few records.</p>
          </div>
          {senderFields}
          <p className="text-gray-400 text-xs">Emails will come from <span className="text-white">{fromPreview(form.from_name, form.from_local, form.domain)}</span></p>
          <button type="submit" disabled={busy !== '' || !apiKeySet || !form.domain.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg">
            {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Add domain
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {editing ? (
            <form onSubmit={saveEdit} className="space-y-3">
              {senderFields}
              <div className="flex gap-2">
                <button type="submit" disabled={busy !== ''} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg">{busy === 'save' ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              </div>
            </form>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm">
                <p className="text-gray-300">From <span className="text-white">{fromPreview(sender.from_name, sender.from_local, sender.domain)}</span></p>
                {sender.reply_to && <p className="text-gray-500 text-xs">Replies to {sender.reply_to}</p>}
              </div>
              <button onClick={() => { setForm({ domain: sender.domain, from_name: sender.from_name, from_local: sender.from_local, reply_to: sender.reply_to || '' }); setEditing(true) }} className="text-gray-400 hover:text-white text-xs flex items-center gap-1 shrink-0">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          )}

          {sender.status !== 'verified' && (
            <div>
              <p className="text-gray-300 text-xs mb-2">
                Add these records at the DNS host for <span className="text-white">{sender.domain}</span>, then click <span className="text-white">Check now</span>. DNS can take from a few minutes to a few hours to show up.
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 text-gray-500">
                    <tr><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Name / Host</th><th className="text-left px-3 py-2">Value</th><th className="text-left px-3 py-2">Priority</th><th className="text-left px-3 py-2">Status</th></tr>
                  </thead>
                  <tbody>
                    {sender.dns_records.map((r, i) => (
                      <tr key={i} className="border-t border-gray-700 align-top">
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{r.type}<span className="block text-gray-600">{r.record}</span></td>
                        <td className="px-3 py-2"><div className="flex items-start gap-1.5"><code className="text-gray-200 break-all">{r.name}</code><CopyButton text={r.name} /></div></td>
                        <td className="px-3 py-2"><div className="flex items-start gap-1.5"><code className="text-gray-200 break-all max-w-md">{r.value}</code><CopyButton text={r.value} /></div></td>
                        <td className="px-3 py-2 text-gray-400">{r.priority ?? ''}</td>
                        <td className={`px-3 py-2 whitespace-nowrap ${r.status === 'verified' ? 'text-green-400' : r.status === 'failed' ? 'text-red-400' : 'text-gray-400'}`}>{RECORD_STATUS[r.status || ''] || r.status || '—'}</td>
                      </tr>
                    ))}
                    {sender.dns_records.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-gray-500">No records returned yet. Click Check now.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="text-gray-600 text-xs mt-2">Names are relative to {sender.domain}. If the DNS host wants the full name, add .{sender.domain} (e.g. send.{sender.domain}).</p>
            </div>
          )}
          {sender.status === 'verified' && sender.verified_at && (
            <p className="text-green-400 text-xs flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Verified {new Date(sender.verified_at).toLocaleString()}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {sender.status !== 'verified' && (
              <button onClick={verify} disabled={busy !== ''} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg">
                {busy === 'verify' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check now
              </button>
            )}
            {sender.last_checked_at && <span className="text-gray-600 text-xs">Last checked {new Date(sender.last_checked_at).toLocaleTimeString()}</span>}
            <button onClick={remove} disabled={busy !== ''} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:text-red-300 disabled:opacity-40 text-xs">
              <Trash2 className="w-3.5 h-3.5" /> Remove domain
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
