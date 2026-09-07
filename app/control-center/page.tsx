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
  { key: 'comms',      label: 'Comms',       icon: MessageSquare, href: '/contact-center', live: true },
  { key: 'deals',      label: 'Deals',       icon: Handshake,     href: '/deals',        live: false },
  { key: 'calendar',   label: 'Calendar',    icon: CalendarDays,  href: '/calendar',     live: true },
  { key: 'tasks',      label: 'Tasks',       icon: ListTodo,      href: '/tasks',        live: false },
  { key: 'reputation', label: 'Reputation',  icon: Star,          href: '/reputation',   live: false },
  { key: 'reporting',  label: 'Reporting',   icon: BarChart3,     href: '/reporting',    live: false },
  { key: 'ads',        label: 'Ads Manager', icon: Megaphone,     href: '/ads-manager',  live: false },
  { key: 'social',     label: 'Social',      icon: Share2,        href: '/social',       live: false },
  { key: 'webadmin',   label: 'Web Admin',   icon: Globe,         href: '/web-admin',    live: false },
]

const RADIUS = 260 // px, distance of orbs from center on desktop
const RADIUS_MOBILE = 150

const DECOR_COLORS = ['#22d3ee', '#38bdf8', '#a78bfa', '#c084fc', '#818cf8']

interface DecorOrb {
  id: number
  size: number
  radius: number
  duration: number
  delay: number
  direction: 'normal' | 'reverse'
  color: string
  blur: number
  opacity: number
}

export default function ControlCenterPage() {
  const { agent, agentLoading } = useSoftphone()
  const router = useRouter()
  const [askValue, setAskValue] = useState('')
  const [askMsg, setAskMsg] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [animPlayState, setAnimPlayState] = useState<'running' | 'paused'>('running')

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

  // Pause decorative animation when the tab isn't visible
  useEffect(() => {
    const onVisibility = () => setAnimPlayState(document.hidden ? 'paused' : 'running')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
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

  // Decorative orbiting orbs — generated once on mount (client-only, so no SSR
  // hydration mismatch from Math.random since this page never renders real
  // content on the server: it returns null until the agent loads from localStorage).
  const decorOrbs: DecorOrb[] = useMemo(() => {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: i,
      size: 4 + Math.random() * 10,
      radius: (isMobile ? 90 : 200) + Math.random() * (isMobile ? 90 : 220),
      duration: 40 + Math.random() * 70,
      delay: -Math.random() * 100, // negative delay staggers starting position along the path
      direction: Math.random() > 0.5 ? 'normal' : 'reverse',
      color: DECOR_COLORS[i % DECOR_COLORS.length],
      blur: 1 + Math.random() * 3,
      opacity: 0.3 + Math.random() * 0.4,
    }))
  }, [isMobile])

  function submitAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!askValue.trim()) return
    setAskMsg('AI assistant is coming soon — this will be able to answer questions and take actions across every orb above.')
    setAskValue('')
    setTimeout(() => setAskMsg(''), 5000)
  }

  if (!agent) return null

  return (
    <div
      className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-4 py-10"
      style={{
        backgroundImage: 'url(/control-center-bg.png)',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundColor: '#050810', // fallback while the image loads
      }}
    >
      {/* Subtle dark overlay for text/icon contrast — does not alter the supplied image */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(5,8,16,0.25)_0%,_rgba(5,8,16,0.55)_65%,_rgba(5,8,16,0.75)_100%)]" />

      {/* Decorative orbiting orbs — behind UI content, never intercept clicks */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {decorOrbs.map(o => (
          <div
            key={o.id}
            className="orbit-drift-wrap absolute top-1/2 left-1/2"
            style={{
              width: 0,
              height: 0,
              animationName: 'orbit-spin-cw',
              animationDuration: `${o.duration}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationDirection: o.direction,
              animationDelay: `${o.delay}s`,
              animationPlayState: animPlayState,
            }}
          >
            <div
              className="absolute rounded-full"
              style={{
                width: o.size,
                height: o.size,
                left: o.radius,
                top: 0,
                background: o.color,
                opacity: o.opacity,
                boxShadow: `0 0 ${o.blur * 4}px ${o.blur}px ${o.color}`,
                filter: `blur(${o.blur * 0.3}px)`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="relative z-10 text-center mb-6">
        <p className="text-cyan-500/70 text-xs uppercase tracking-[0.3em]">Control Center</p>
        <h1 className="text-white text-2xl font-bold mt-1">Welcome, {agent.name}</h1>
      </div>

      {/* Orbit system */}
      <div
        className="relative shrink-0"
        style={{ width: radius * 2 + 120, height: radius * 2 + 120 }}
      >
        {/* Decorative rotating rings — restrained, sit on top of the image's own ring motif */}
        <div
          className="absolute rounded-full orbit-ring-slow"
          style={{
            inset: 60,
            padding: 1,
            animationPlayState: animPlayState,
            background: 'conic-gradient(from 0deg, rgba(34,211,238,0.3), rgba(192,132,252,0.3), rgba(236,72,153,0.22), rgba(45,212,191,0.3), rgba(34,211,238,0.3))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 1px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 1px))',
          }}
        />
        <div
          className="absolute rounded-full border border-cyan-300/10 orbit-ring-slow-reverse"
          style={{ inset: 10, animationPlayState: animPlayState }}
        />

        {/* Center hub */}
        <div
          className="orbit-core-glow pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(34,211,238,0.45) 0%, rgba(34,211,238,0) 70%)',
            animationPlayState: animPlayState,
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-cyan-900/70 via-purple-950/60 to-gray-950 border border-cyan-400/50 z-20">
          <Sparkles className="w-6 h-6 text-cyan-300 mb-1 drop-shadow-[0_0_8px_rgba(192,132,252,0.7)]" />
          <span className="bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent text-[11px] font-semibold uppercase tracking-wider">Online</span>
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
