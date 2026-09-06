'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ListTodo } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import ComingSoon from '@/components/ComingSoon'

export default function TasksPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  if (!agent) return null

  return <ComingSoon icon={ListTodo} title="Tasks" description="Assign and track follow-up tasks for every contact." />
}
