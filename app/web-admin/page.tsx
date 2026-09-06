'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function WebAdminPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={Globe} title="Web Admin" description="Manage your website and lead capture forms." />
}
