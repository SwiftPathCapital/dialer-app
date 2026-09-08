'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function AdsManagerPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={Megaphone} title="Ads Manager" description="Manage ad campaigns and track spend without leaving the dashboard." glowColor="#fb923c" />
}
