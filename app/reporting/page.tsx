'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function ReportingPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={BarChart3} title="Reporting" description="Cross-channel performance reporting for calls, texts, and deals." glowColor="#a78bfa" />
}
