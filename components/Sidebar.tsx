'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Phone, MessageSquare, Voicemail, Users, SlidersHorizontal, LogOut, Wifi, WifiOff, PhoneCall, Activity } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { supabase } from '@/lib/supabase'
import Tour from '@/components/Tour'

const NAV = [
  { href: '/dashboard', icon: Phone, label: 'Softphone', dataTour: 'nav-softphone' },
  { href: '/sms', icon: MessageSquare, label: 'SMS', dataTour: 'nav-sms' },
  { href: '/voicemail', icon: Voicemail, label: 'Voicemail', dataTour: 'nav-voicemail' },
]

const ADMIN_NAV = [
  { href: '/admin/monitor', icon: Activity, label: 'Monitor', dataTour: 'nav-monitor' },
  { href: '/admin/calls', icon: PhoneCall, label: 'Call Center', dataTour: 'nav-calls' },
  { href: '/admin/groups', icon: Users, label: 'Groups', dataTour: 'nav-groups' },
  { href: '/admin/config', icon: SlidersHorizontal, label: 'Config', dataTour: '' },
]

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', dot: 'bg-green-500', text: 'text-green-400' },
  { value: 'busy',      label: 'Busy',      dot: 'bg-yellow-500', text: 'text-yellow-400' },
  { value: 'offline',   label: 'Offline',   dot: 'bg-gray-500',  text: 'text-gray-400'  },
]

function StatusPicker() {
  const { agent, setAgent } = useSoftphone()
  const [open, setOpen] = useState(false)

  if (!agent) return null
  const currentAgent = agent
  const current = STATUS_OPTIONS.find(o => o.value === currentAgent.status) ?? STATUS_OPTIONS[2]

  async function pick(value: string) {
    if (!agent) return
    setOpen(false)
    const updated = { ...agent, status: value as typeof agent.status }
    setAgent(updated)
    await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agent.id, status: value }),
    }).catch(() => {})
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${current.dot}`} />
        <span className={`hidden md:block text-xs font-medium ${current.text}`}>{current.label}</span>
        <span className={`md:hidden w-2 h-2 rounded-full ${current.dot}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-36 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => pick(opt.value)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-700 transition-colors ${currentAgent.status === opt.value ? 'text-white' : 'text-gray-400'}`}
            >
              <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { agent, setAgent, connected } = useSoftphone()
  const [unreadVoicemails, setUnreadVoicemails] = useState(0)

  useEffect(() => {
    if (!agent) return

    fetch('/api/voicemail')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setUnreadVoicemails(data.filter((v: { listened: boolean }) => !v.listened).length)
      })
      .catch(() => {})

    const sub = supabase
      .channel('sidebar-voicemails')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voicemails' }, () => {
        setUnreadVoicemails(prev => prev + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'voicemails' }, (payload) => {
        const p = payload as unknown as { new: { listened: boolean }, old: { listened: boolean } }
        if (p.new.listened && !p.old.listened) setUnreadVoicemails(prev => Math.max(0, prev - 1))
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [agent])

  function logout() {
    setAgent(null)
  }

  return (
    <aside className="w-16 md:w-56 flex flex-col bg-gray-800 border-r border-gray-700 h-screen shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-700">
        <span className="hidden md:block text-white font-bold text-lg tracking-wide">Dialer</span>
        <span className="md:hidden text-white font-bold text-lg">D</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-0.5">
        {NAV.map(({ href, icon: Icon, label, dataTour }) => {
          const active = pathname === href
          const badge = href === '/voicemail' && unreadVoicemails > 0 ? unreadVoicemails : 0
          return (
            <Link
              key={href}
              href={href}
              data-tour={dataTour || undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <div className="relative shrink-0">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className="hidden md:block">{label}</span>
            </Link>
          )
        })}

        {/* Admin section — only visible to admins */}
        {agent?.role === 'admin' && (
          <div className="mt-auto pt-4 border-t border-gray-700 space-y-0.5">
            <p className="hidden md:block text-gray-600 text-xs uppercase tracking-widest px-3 pb-1">Admin</p>
            {ADMIN_NAV.map(({ href, icon: Icon, label, dataTour }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  data-tour={dataTour || undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="hidden md:block">{label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Agent status + connection */}
      {agent && (
        <div className="border-t border-gray-700 p-3 space-y-2">
          {/* Name + connection indicator */}
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-gray-300 text-xs truncate">{agent.name}</span>
            <span className="ml-auto hidden md:flex items-center gap-1 text-xs text-gray-500">
              {connected ? (
                <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-400">Live</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-red-400">Off</span></>
              )}
            </span>
          </div>

          {/* Status picker */}
          <div data-tour="status-picker">
            <StatusPicker />
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors w-full"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden md:block">Sign out</span>
          </button>

          <Tour />
        </div>
      )}
    </aside>
  )
}
