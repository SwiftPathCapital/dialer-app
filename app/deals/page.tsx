'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Handshake } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function DealsPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={Handshake} title="Deals" description="Track active deals through your pipeline, stage by stage." />
}
