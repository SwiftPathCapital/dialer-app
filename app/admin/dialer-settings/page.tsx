'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSoftphone } from '@/lib/SoftphoneContext'
import DialerSettingsPanel from '@/components/DialerSettingsPanel'

export default function DialerSettingsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    if (agent.role !== 'admin' && !agent.is_platform_admin) router.push('/dashboard')
  }, [agent, agentLoading, router])

  if (!agent || (agent.role !== 'admin' && !agent.is_platform_admin)) return null

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Dialer Settings</h1>
      <p className="text-gray-400 text-sm mt-0.5 mb-6">Local presence numbers, callback routing, and dialer modes for your account.</p>
      <DialerSettingsPanel agentId={agent.id} />
    </div>
  )
}
