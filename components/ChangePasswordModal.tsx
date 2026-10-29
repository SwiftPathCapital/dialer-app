'use client'

import { useState } from 'react'
import { X, KeyRound, Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSoftphone } from '@/lib/SoftphoneContext'

const MIN_LENGTH = 8

export function passwordProblem(next: string, confirm: string, current: string): string | null {
  if (next.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return 'Include at least one letter and one number.'
  if (next === current) return 'Pick a password different from your current one.'
  if (next !== confirm) return "The new passwords don't match."
  return null
}

// Changes the signed-in user's password directly with Supabase Auth from the browser, so
// no app server route has to trust who the caller claims to be. The current password is
// re-checked first; the re-check must land on the same account the app shows as logged in.
export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { agent } = useSoftphone()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!agent) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!agent) return
    const problem = passwordProblem(next, confirm, current)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    try {
      // Prefer the email on the live Supabase session for this same user; the copy saved in
      // the browser can be stale if the login's email was changed since they signed in.
      const { data: sessionData } = await supabase.auth.getSession()
      const sessionUser = sessionData.session?.user
      const email = sessionUser?.id === agent.id && sessionUser.email ? sessionUser.email : agent.email

      const { data: verified, error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current })
      if (verifyError || !verified.user) { setError('Your current password is incorrect.'); return }
      if (verified.user.id !== agent.id) {
        await supabase.auth.signOut()
        setError('Your sign-in is out of date. Sign out, sign back in, then try again.')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) { setError(updateError.message || 'Could not change your password.'); return }
      setDone(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="change-pw-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          <h2 id="change-pw-title" className="text-white font-semibold">Change password</h2>
        </div>
        <p className="text-gray-500 text-xs mb-5">{agent.email}</p>

        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-white font-medium mt-3">Password changed</p>
            <p className="text-gray-400 text-sm mt-1">Use your new password the next time you sign in.</p>
            <button onClick={onClose} className="mt-5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="pw-current" className="text-gray-400 text-xs block mb-1">Current password</label>
              <input id="pw-current" type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} required autoFocus />
            </div>
            <div>
              <label htmlFor="pw-new" className="text-gray-400 text-xs block mb-1">New password</label>
              <input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={inputCls} required />
              <p className="text-gray-600 text-[11px] mt-1">At least {MIN_LENGTH} characters, with a letter and a number.</p>
            </div>
            <div>
              <label htmlFor="pw-confirm" className="text-gray-400 text-xs block mb-1">Confirm new password</label>
              <input id="pw-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} required />
            </div>
            <button type="button" onClick={() => setShow(s => !s)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {show ? 'Hide' : 'Show'} passwords
            </button>
            {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
            <button type="submit" disabled={saving || !current || !next || !confirm} className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Change password
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
