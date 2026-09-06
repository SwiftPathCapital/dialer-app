'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, Users, Handshake, CalendarDays, ListTodo, MessageSquare,
  Star, BarChart3, Megaphone, Share2, Globe, Sparkles, LucideIcon,
} from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

interface Orb {
  key: string
  label: string
  icon: LucideIcon
  href: string
  live: boolean // true = fully functional today, false = coming soon
}

const ORBS: Orb[] = [
  { key: 'dialer',     label: 'Dialer',      icon: Phone,         href: '/dashboard',    live: true },
  { key: 'contacts',   label: 'Contacts',    icon: Users,         href: '/leads',        live: true },
  { key: 'comms',      label: 'Comms',       icon: MessageSquare, href: '/sms',          live: true },
  { key: 'deals',      label: 'Deals',       icon: Handshake,     href: '/deals',        live: false },
  { key: 'calendar',   label: 'Calendar',    icon: CalendarDays,  href: '/calendar',     live: false },
  { key: 'tasks',      label: 'Tasks',       icon: ListTodo,      href: '/tasks',        live: false },
  { key: 'reputation', label: 'Reputation',  icon: Star,          href: '/reputation',   live: false },
  { key: 'reporting',  label: 'Reporting',   icon: BarChart3,     href: '/reporting',    live: false },
  { key: 'ads',        label: 'Ads Manager', icon: Megaphone,     href: '/ads-manager',  live: false },
  { key: 'social',     label: 'Social',      icon: Share2,        href: '/social',       live: false },
  { key: 'webadmin',   label: 'Web Admin',   icon: Globe,         href: '/web-admin',    live: false },
]

const RADIUS = 260 // px, distance of orbs from center on desktop
const RADIUS_MOBILE = 150

export default function ControlCenterPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [askValue, setAskValue] = useState('')
  const [askMsg, setAskMsg] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (agentLoading) return
    if (!agent) { router.push('/login'); return }
  }, [agent, agentLoading, router])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const radius = isMobile ? RADIUS_MOBILE : RADIUS

  const positioned = useMemo(() => {
    return ORBS.map((orb, i) => {
      const angle = (360 / ORBS.length) * i - 90 // start at top, go clockwise
      const rad = (angle * Math.PI) / 180
      const x = Math.cos(rad) * radius
      const y = Math.sin(rad) * radius
      return { ...orb, x, y }
    })
  }, [radius])

  function submitAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!askValue.trim()) return
    setAskMsg('AI assistant is coming soon — this will be able to answer questions and take actions across every orb above.')
    setAskValue('')
    setTimeout(() => setAskMsg(''), 5000)
  }

  if (!agent) return null

  return (
    <div className="relative min-h-screen bg-[#050810] overflow-hidden flex flex-col items-center justify-center px-4 py-10">
      {/* Starfield-ish backdrop */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 20% 30%, rgba(34,211,238,0.5), transparent), radial-gradient(1px 1px at 70% 60%, rgba(34,211,238,0.4), transparent), radial-gradient(1px 1px at 40% 80%, rgba(34,211,238,0.3), transparent), radial-gradient(1px 1px at 85% 20%, rgba(34,211,238,0.4), transparent), radial-gradient(1px 1px at 10% 70%, rgba(34,211,238,0.3), transparent)',
          backgroundSize: '100% 100%',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(8,145,178,0.08)_0%,_transparent_60%)]" />

      <div className="relative z-10 text-center mb-6">
        <p className="text-cyan-500/70 text-xs uppercase tracking-[0.3em]">Control Center</p>
        <h1 className="text-white text-2xl font-bold mt-1">Welcome, {agent.name}</h1>
      </div>

      {/* Orbit system */}
      <div
        className="relative shrink-0"
        style={{ width: radius * 2 + 120, height: radius * 2 + 120 }}
      >
        {/* Decorative rotating rings */}
        <div
          className="absolute rounded-full border border-cyan-500/20 orbit-ring-slow"
          style={{ inset: 60 }}
        />
        <div
          className="absolute rounded-full border border-cyan-500/10 orbit-ring-slow-reverse"
          style={{ inset: 10 }}
        />

        {/* Center hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center w-28 h-28 rounded-full bg-gradient-to-b from-cyan-900/60 to-gray-950 border border-cyan-400/50 orbit-pulse z-20">
          <Sparkles className="w-6 h-6 text-cyan-300 mb-1" />
          <span className="text-cyan-200 text-[11px] font-semibold uppercase tracking-wider">Online</span>
        </div>

        {/* Orbs */}
        {positioned.map(orb => {
          const Icon = orb.icon
          return (
            <button
              key={orb.key}
              onClick={() => router.push(orb.href)}
              className="absolute top-1/2 left-1/2 flex flex-col items-center gap-1.5 group z-10"
              style={{ transform: `translate(${orb.x - 32}px, ${orb.y - 32}px)` }}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all duration-200 group-hover:scale-110 ${
                  orb.live
                    ? 'bg-cyan-950/60 border-cyan-400/60 shadow-[0_0_18px_rgba(34,211,238,0.35)] group-hover:shadow-[0_0_28px_rgba(34,211,238,0.6)]'
                    : 'bg-gray-900/60 border-gray-700 group-hover:border-cyan-600/50'
                }`}
              >
                <Icon className={`w-6 h-6 ${orb.live ? 'text-cyan-300' : 'text-gray-500 group-hover:text-cyan-400'}`} />
              </div>
              <span className={`text-xs font-medium ${orb.live ? 'text-cyan-200' : 'text-gray-500'}`}>{orb.label}</span>
              {!orb.live && (
                <span className="text-[9px] uppercase tracking-wider text-gray-600">Soon</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Ask bar */}
      <form onSubmit={submitAsk} className="relative z-10 w-full max-w-md mt-8">
        <div className="flex items-center gap-2 bg-gray-900/70 border border-cyan-500/20 rounded-full px-4 py-2.5 backdrop-blur-sm">
          <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
          <input
            value={askValue}
            onChange={e => setAskValue(e.target.value)}
            placeholder="Ask your assistant anything…"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600"
          />
        </div>
        {askMsg && <p className="text-cyan-500/70 text-xs text-center mt-2">{askMsg}</p>}
      </form>
    </div>
  )
}
