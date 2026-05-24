'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSoftphone } from '@/lib/SoftphoneContext'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
    if (agent.role !== 'admin') { router.push('/dashboard'); return }
  }, [agent, agentLoading, router])

  if (agentLoading || !agent || agent.role !== 'admin') return null

  return <>{children}</>
}
