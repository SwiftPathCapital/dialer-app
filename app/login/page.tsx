'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { Agent } from '@/lib/types'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAgent } = useSoftphone()
  const router = useRouter()

  async function login() {
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/agents')
    const agents: Agent[] = await res.json()
    const found = agents.find(a => a.email.toLowerCase() === email.toLowerCase())

    if (!found) {
      setError('No agent found with that email. Ask your admin to add you.')
      setLoading(false)
      return
    }

    setAgent(found)
    router.push('/dashboard')
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
        <p className="text-gray-400 text-sm text-center mb-8">Enter your agent email to continue</p>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="agent@swiftpathcapital.net"
            className="w-full bg-gray-900 text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={login}
            disabled={loading || !email.trim()}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}
