'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Voicemail } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { supabase } from '@/lib/supabase'
import { Voicemail as VM } from '@/lib/types'
import VoicemailPlayer from '@/components/VoicemailPlayer'

export default function VoicemailPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [voicemails, setVoicemails] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }

    fetch('/api/voicemail')
      .then(r => r.json())
      .then(data => { setVoicemails(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(console.error)

    const sub = supabase
      .channel('voicemails-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voicemails' }, payload => {
        setVoicemails(prev => [payload.new as VM, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [agent, router])

  function markListened(id: string) {
    setVoicemails(prev => prev.map(v => v.id === id ? { ...v, listened: true } : v))
  }

  function removeVoicemail(id: string) {
    setVoicemails(prev => prev.filter(v => v.id !== id))
  }

  if (!agent) return null

  const unheard = voicemails.filter(v => !v.listened).length

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-white">Voicemail</h1>
        {unheard > 0 && (
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {unheard} new
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : voicemails.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-600">
          <Voicemail className="w-10 h-10 mb-3" />
          <p>No voicemails</p>
        </div>
      ) : (
        <div className="space-y-3">
          {voicemails.map(vm => (
            <VoicemailPlayer key={vm.id} voicemail={vm} onListened={markListened} onDelete={removeVoicemail} />
          ))}
        </div>
      )}
    </div>
  )
}
