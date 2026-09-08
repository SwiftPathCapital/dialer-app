'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Share2 } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function SocialPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={Share2} title="Social" description="Schedule and publish posts across your social accounts." glowColor="#f472b6" />
}
