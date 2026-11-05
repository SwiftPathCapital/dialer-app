'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileSignature, CheckCircle2, Loader2, Download, AlertTriangle } from 'lucide-react'
import SignaturePad from '@/components/SignaturePad'

interface SignInfo {
  status: 'sent' | 'viewed' | 'signed' | 'voided' | 'expired'
  business_name: string
  template_name: string
  signer_name: string
  body?: string
  consent_text?: string
  amount?: string | null
  signed_at?: string | null
  signature_name?: string | null
}

const card = 'bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl'
const inputCls = 'w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-cyan-500'

// Renders the contract text: '# ' lines are headings, blank lines separate paragraphs.
function ContractText({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/)
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-gray-100">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        return (
          <div key={i}>
            {lines.map((line, j) => line.startsWith('# ')
              ? <h2 key={j} className="text-white text-lg font-semibold mt-2">{line.slice(2)}</h2>
              : <p key={j} className="whitespace-pre-wrap">{line}</p>)}
          </div>
        )
      })}
    </div>
  )
}

export default function SignPage() {
  const { token } = useParams<{ token: string }>()
  const api = `/api/sign/${encodeURIComponent(token)}`
  const [info, setInfo] = useState<SignInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [consent, setConsent] = useState(false)
  const [name, setName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(api, { cache: 'no-store' })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'This link isn\'t valid.')
        setInfo(d)
        setName(n => n || d.signer_name || '')
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'This link isn\'t valid.'))
  }, [api])

  async function sign() {
    setError('')
    if (!consent) { setError('Please agree to sign electronically.'); return }
    if (name.trim().length < 2) { setError('Type your full name.'); return }
    if (!signature) { setError('Draw your signature in the box.'); return }
    setSubmitting(true)
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, signature_name: name.trim(), signature_image: signature }),
    }).catch(() => null)
    const d = await res?.json().catch(() => null)
    setSubmitting(false)
    if (!res?.ok) { setError(d?.error || 'Could not sign. Check your connection and try again.'); return }
    setInfo(i => i ? { ...i, status: 'signed', signed_at: d.signed_at, signature_name: name.trim() } : i)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-full flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-3xl">{children}</div>
    </div>
  )

  if (loadError) return shell(<div className={`${card} p-8 text-center text-gray-300`}>{loadError}</div>)
  if (!info) return shell(<p className="text-gray-300 text-center flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>)

  const header = (
    <div className="mb-6 flex items-start gap-4">
      <div className="neon-breathe w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
        <FileSignature className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-cyan-300 text-sm font-medium">{info.business_name}</p>
        <h1 className="text-white text-2xl md:text-3xl font-bold mt-0.5">{info.template_name}</h1>
        {info.amount && <p className="text-gray-400 text-sm mt-2">Amount: <span className="text-white font-medium">{info.amount}</span></p>}
      </div>
    </div>
  )

  if (info.status === 'voided' || info.status === 'expired') {
    return shell(<>{header}<div className={`${card} p-8 text-center`}>
      <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
      <p className="text-white text-lg font-medium mt-3">{info.status === 'expired' ? 'This signing link has expired.' : 'This document was cancelled by the sender.'}</p>
      <p className="text-gray-400 text-sm mt-2">Contact {info.business_name} if you still need to sign.</p>
    </div></>)
  }

  if (info.status === 'signed') {
    return shell(<>{header}<div className={`${card} p-8 text-center`}>
      <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
      <h2 className="text-white text-2xl font-bold mt-4">Signed — thank you</h2>
      <p className="text-gray-300 mt-2">
        {info.signature_name ? `Signed by ${info.signature_name}` : 'Signed'}
        {info.signed_at ? ` on ${new Date(info.signed_at).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}` : ''}.
      </p>
      <a href={`${api}/pdf`} className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 text-white font-semibold rounded-lg">
        <Download className="w-4 h-4" /> Download your signed copy (PDF)
      </a>
      <p className="text-gray-500 text-xs mt-4">Keep this copy for your records. You can come back to this link to download it again.</p>
    </div></>)
  }

  return shell(<>
    {header}
    <div className={`${card} p-6 md:p-8`}>
      <p className="text-gray-400 text-sm mb-4">Hi {info.signer_name.split(/\s+/)[0]}, please read the document below and sign at the bottom.</p>
      <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-5 md:p-6 max-h-[60vh] overflow-y-auto">
        <ContractText body={info.body ?? ''} />
      </div>

      <div className="mt-6 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 w-4 h-4 accent-cyan-500 shrink-0" />
          <span className="text-gray-300 text-sm leading-relaxed">{info.consent_text}</span>
        </label>

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1.5" htmlFor="sig-name">Type your full legal name</label>
          <input id="sig-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" className={inputCls} />
        </div>

        <div>
          <p className="text-gray-300 text-sm font-medium mb-1.5">Draw your signature</p>
          <SignaturePad onChange={setSignature} disabled={submitting} />
        </div>

        {error && <p className="text-pink-300 text-sm">{error}</p>}

        <button
          onClick={sign}
          disabled={submitting}
          className="w-full py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white font-semibold rounded-lg transition-opacity flex items-center justify-center gap-2"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing…</> : <><FileSignature className="w-4 h-4" /> Sign document</>}
        </button>
        <p className="text-gray-500 text-xs text-center">By clicking Sign document, you are signing this document electronically.</p>
      </div>
    </div>
  </>)
}
