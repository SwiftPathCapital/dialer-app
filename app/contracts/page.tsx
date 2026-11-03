'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ContractsPanel from '@/components/ContractsPanel'

export default function ContractsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) router.push('/login')
  }, [agent, agentLoading, router])

  if (!agent) return null
  const isAdmin = agent.role === 'admin' || agent.is_platform_admin

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-white text-2xl font-bold">Contracts</h1>
      <p className="text-gray-400 text-sm mt-1 mb-6">
        {isAdmin ? 'Every contract sent from this account.' : 'Contracts you\'ve sent.'} To send a new one, open a lead and use <span className="text-gray-200">Send contract</span>. Status updates on its own as the client opens and signs.
      </p>
      <ContractsPanel />
    </div>
  )
}
