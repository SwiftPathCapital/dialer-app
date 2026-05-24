'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSoftphone } from '@/lib/SoftphoneContext'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { setAgent } = useSoftphone()
  const router = useRouter()

  async function login() {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')

    // Sign in via Supabase auth (same credentials as the CRM)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    // Fetch the agents row to get SIP credentials and name
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, name, email, sip_username, sip_password, extension, status, voicemail_greeting_url, updated_at')
      .eq('id', authData.user.id)
      .single()

    if (agentError || !agent) {
      setError('Account exists but no agent profile found. Contact your admin.')
      setLoading(false)
      return
    }

    setAgent(agent)
    router.push('/dashboard')
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-gray-700">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center">
            <Phone className="w-7 h-7 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white text-center mb-1">SwiftPath Dialer</h1>
        <p className="text-gray-400 text-sm text-center mb-8">Sign in with your CRM credentials</p>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Email"
            className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Password"
            className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={login}
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}
