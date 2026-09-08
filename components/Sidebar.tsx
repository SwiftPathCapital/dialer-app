'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Phone, MessageSquare, Voicemail, Users, SlidersHorizontal, LogOut, Wifi, WifiOff, PhoneCall, Activity, BarChart2, CalendarClock, CalendarDays, List, Tag, Orbit, Building2 } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { supabase } from '@/lib/supabase'
import Tour from '@/components/Tour'

const NAV = [
  { href: '/control-center', icon: Orbit,     label: 'Control Center', dataTour: '', emoji: '🛰️' },
  { href: '/dashboard',  icon: Phone,         label: 'Softphone',  dataTour: 'nav-softphone', emoji: '📞' },
  { href: '/contact-center', icon: MessageSquare, label: 'Conversations', dataTour: 'nav-sms', emoji: '💬' },
  { href: '/voicemail',  icon: Voicemail,     label: 'Voicemail',  dataTour: 'nav-voicemail', emoji: '📼' },
  { href: '/callbacks',  icon: CalendarClock, label: 'Callbacks',  dataTour: '', emoji: '⏰' },
  { href: '/calls',      icon: List,          label: 'Call Log',   dataTour: '', emoji: '📋' },
]

const ADMIN_NAV = [
  { href: '/admin/monitor',    icon: Activity,          label: 'Monitor',    dataTour: 'nav-monitor', emoji: '👁️' },
  { href: '/admin/analytics',  icon: BarChart2,          label: 'Analytics',  dataTour: '', emoji: '📊' },
  { href: '/admin/calls',      icon: PhoneCall,          label: 'Call Center',dataTour: 'nav-calls', emoji: '☎️' },
  { href: '/admin/callbacks',  icon: CalendarClock,      label: 'Callbacks',  dataTour: '', emoji: '🗓️' },
  { href: '/admin/calendars',  icon: CalendarDays,       label: 'Calendars',  dataTour: '', emoji: '📆' },
  { href: '/admin/groups',     icon: Users,              label: 'Groups',     dataTour: 'nav-groups', emoji: '👥' },
  { href: '/admin/tags',       icon: Tag,                label: 'Tags',       dataTour: '', emoji: '🏷️' },
  { href: '/admin/config',     icon: SlidersHorizontal,  label: 'Config',     dataTour: '', emoji: '⚙️' },
]

// A slow cycling set for the "living" logo mark, in place of one static icon.
const LOGO_CYCLE = ['✨', '🌌', '🛰️', '🚀']
const LOGO_CYCLE_DURATION = 12 // seconds for the full cycle, must match globals.css's slot math (4 items @ 25% each)

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', emoji: '🛰️', dot: 'bg-green-500', text: 'text-green-400' },
  { value: 'busy',      label: 'Busy',      emoji: '☄️', dot: 'bg-yellow-500', text: 'text-yellow-400' },
  { value: 'offline',   label: 'Offline',   emoji: '🌑', dot: 'bg-gray-500',  text: 'text-gray-400'  },
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
        <span className="text-[11px] leading-none shrink-0" title={current.label}>{current.emoji}</span>
        <span className={`hidden md:block text-xs font-medium ${current.text}`}>{current.label}</span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-36 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => pick(opt.value)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-700 transition-colors ${currentAgent.status === opt.value ? 'text-white' : 'text-gray-400'}`}
            >
              <span className="text-[11px] leading-none">{opt.emoji}</span>
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

  // Tenant-level hides are a baseline every agent in that tenant inherits, on top of
  // whatever an admin has hidden for that specific agent.
  const hiddenFeatures = [...(agent?.hidden_features ?? []), ...(agent?.tenant_hidden_features ?? [])]

  const initials = agent?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'
  const statusRing = agent?.status === 'available' ? 'ring-green-400/60 shadow-[0_0_16px_rgba(74,222,128,0.5)]'
    : agent?.status === 'busy' ? 'ring-yellow-400/60 shadow-[0_0_16px_rgba(250,204,21,0.5)]'
    : 'ring-gray-500/40'

  return (
    <aside className="relative w-16 md:w-56 flex flex-col bg-[#070a14] border-r border-cyan-500/10 h-screen shrink-0 overflow-hidden shadow-[6px_0_40px_-15px_rgba(34,211,238,0.25)]">
      {/* Galaxy backdrop blobs */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="absolute top-1/3 -right-12 w-44 h-44 rounded-full bg-purple-500/25 blur-3xl" />
        <div className="absolute bottom-24 -left-14 w-40 h-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-36 h-36 rounded-full bg-teal-400/20 blur-3xl" />
      </div>

      {/* Logo — a small cycling emoji mark instead of one static icon */}
      <div className="relative px-4 py-5 border-b border-cyan-500/10 flex items-center gap-2">
        <div className="relative w-5 h-5 shrink-0 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" aria-hidden>
          {LOGO_CYCLE.map((emoji, i) => (
            <span
              key={emoji}
              className="logo-cycle-item absolute inset-0 flex items-center justify-center text-base leading-none"
              style={{
                animationDuration: `${LOGO_CYCLE_DURATION}s`,
                animationDelay: `${-(i * (LOGO_CYCLE_DURATION / LOGO_CYCLE.length))}s`,
              }}
            >
              {emoji}
            </span>
          ))}
        </div>
        <span className="hidden md:block font-bold text-lg tracking-wide bg-gradient-to-r from-cyan-300 via-teal-200 to-purple-300 bg-clip-text text-transparent">
          Dialer
        </span>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 py-4 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.filter(({ href }) => !hiddenFeatures.includes(href)).map(({ href, icon: Icon, label, dataTour, emoji }) => {
          const active = pathname === href
          const badge = href === '/voicemail' && unreadVoicemails > 0 ? unreadVoicemails : 0
          return (
            <Link
              key={href}
              href={href}
              data-tour={dataTour || undefined}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-gradient-to-r from-cyan-600/80 to-purple-600/70 text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] border border-cyan-400/30'
                  : 'text-gray-400 hover:text-cyan-100 hover:bg-cyan-500/10 border border-transparent'
              }`}
            >
              <div className="relative shrink-0">
                <Icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]' : ''}`} />
                <span
                  className={`absolute -bottom-1.5 -right-1.5 text-[10px] leading-none rounded-full transition-all ${
                    active ? 'opacity-100 scale-110 drop-shadow-[0_0_4px_rgba(34,211,238,0.9)]' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'
                  }`}
                >
                  {emoji}
                </span>
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-pink-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(236,72,153,0.8)]">
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
          <div className="mt-auto pt-4 border-t border-cyan-500/10 space-y-0.5">
            <p className="hidden md:block text-transparent bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-xs uppercase tracking-widest px-3 pb-1 font-semibold">Admin</p>
            {ADMIN_NAV.filter(({ href }) => !agent?.tenant_hidden_features?.includes(href)).map(({ href, icon: Icon, label, dataTour, emoji }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  data-tour={dataTour || undefined}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-purple-600/80 to-pink-600/70 text-white shadow-[0_0_18px_rgba(192,132,252,0.35)] border border-purple-400/30'
                      : 'text-gray-400 hover:text-purple-100 hover:bg-purple-500/10 border border-transparent'
                  }`}
                >
                  <div className="relative shrink-0">
                    <Icon className="w-5 h-5" />
                    <span
                      className={`absolute -bottom-1.5 -right-1.5 text-[10px] leading-none rounded-full transition-all ${
                        active ? 'opacity-100 scale-110 drop-shadow-[0_0_4px_rgba(192,132,252,0.9)]' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'
                      }`}
                    >
                      {emoji}
                    </span>
                  </div>
                  <span className="hidden md:block">{label}</span>
                </Link>
              )
            })}
          </div>
        )}

        {/* Platform section — only visible to the platform admin (manages all tenants) */}
        {agent?.is_platform_admin && (
          <div className="pt-4 space-y-0.5">
            <p className="hidden md:block text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-xs uppercase tracking-widest px-3 pb-1 font-semibold">Platform</p>
            {(() => {
              const active = pathname.startsWith('/admin/tenants')
              return (
                <Link
                  href="/admin/tenants"
                  className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-cyan-600/80 to-blue-600/70 text-white shadow-[0_0_18px_rgba(34,211,238,0.35)] border border-cyan-400/30'
                      : 'text-gray-400 hover:text-cyan-100 hover:bg-cyan-500/10 border border-transparent'
                  }`}
                >
                  <div className="relative shrink-0">
                    <Building2 className="w-5 h-5" />
                    <span
                      className={`absolute -bottom-1.5 -right-1.5 text-[10px] leading-none rounded-full transition-all ${
                        active ? 'opacity-100 scale-110 drop-shadow-[0_0_4px_rgba(34,211,238,0.9)]' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'
                      }`}
                    >
                      🏢
                    </span>
                  </div>
                  <span className="hidden md:block">Clients</span>
                </Link>
              )
            })()}
          </div>
        )}
      </nav>

      {/* Agent status + connection */}
      {agent && (
        <div className="relative border-t border-cyan-500/10 p-3 space-y-2">
          {/* Avatar + name + connection indicator */}
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br from-cyan-500 to-purple-600 ring-2 ${statusRing}`}>
                {initials}
              </div>
              <span className="absolute -bottom-1 -right-1 text-[10px] leading-none bg-[#070a14] rounded-full">
                {STATUS_OPTIONS.find(o => o.value === agent?.status)?.emoji ?? STATUS_OPTIONS[2].emoji}
              </span>
            </div>
            <span className="hidden md:block text-gray-300 text-xs truncate">{agent.name}</span>
            <span className="ml-auto hidden md:flex items-center gap-1 text-xs text-gray-500">
              {connected ? (
                <><Wifi className="w-3 h-3 text-teal-400" /><span className="text-teal-400">Live</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-pink-400" /><span className="text-pink-400">Off</span></>
              )}
            </span>
          </div>

          {/* Status picker */}
          <div data-tour="status-picker">
            <StatusPicker />
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-pink-400 transition-colors w-full"
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
