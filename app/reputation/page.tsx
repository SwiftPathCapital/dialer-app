'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function ReputationPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={Star} title="Reputation" description="Monitor and respond to reviews across Google and other platforms." />
}
