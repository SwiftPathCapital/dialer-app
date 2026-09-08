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
  glow: string // each orb pulses its own neon color, matching that page's own theme color elsewhere in the app
}

const ORBS: Orb[] = [
  { key: 'dialer',     label: 'Dialer',      icon: Phone,         href: '/dashboard',    live: true,  glow: '#22d3ee' },
  { key: 'contacts',   label: 'Contacts',    icon: Users,         href: '/leads',        live: true,  glow: '#38bdf8' },
  { key: 'comms',      label: 'Comms',       icon: MessageSquare, href: '/contact-center', live: true, glow: '#a78bfa' },
  { key: 'deals',      label: 'Deals',       icon: Handshake,     href: '/deals',        live: false, glow: '#22d3ee' },
  { key: 'calendar',   label: 'Calendar',    icon: CalendarDays,  href: '/calendar',     live: true,  glow: '#f472b6' },
  { key: 'tasks',      label: 'Tasks',       icon: ListTodo,      href: '/tasks',        live: false, glow: '#34d399' },
  { key: 'reputation', label: 'Reputation',  icon: Star,          href: '/reputation',   live: false, glow: '#fbbf24' },
  { key: 'reporting',  label: 'Reporting',   icon: BarChart3,     href: '/reporting',    live: false, glow: '#a78bfa' },
  { key: 'ads',        label: 'Ads Manager', icon: Megaphone,     href: '/ads-manager',  live: false, glow: '#fb923c' },
  { key: 'social',     label: 'Social',      icon: Share2,        href: '/social',       live: false, glow: '#f472b6' },
  { key: 'webadmin',   label: 'Web Admin',   icon: Globe,         href: '/web-admin',    live: false, glow: '#818cf8' },
]

const RADIUS = 260 // px, distance of orbs from center on desktop
const RADIUS_MOBILE = 150
const ORBIT_DURATION = 60 // seconds per full revolution — slow enough to stay clickable, paused on hover anyway

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
  const [ringHovered, setRingHovered] = useState(false)

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
  // Orbiting icons pause on hover so they're actually easy to click, not just decorative
  const ringPlayState: 'running' | 'paused' = animPlayState === 'paused' || ringHovered ? 'paused' : 'running'

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
        backgroundImage: 'url(/control-center-bg.webp)',
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
        {/* Decorative rotating rings — sped up and brightened from the original "restrained"
            pass since the new busy backdrop image makes a slow, faint ring unreadable as
            motion rather than just competing visual noise. */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 60,
            padding: 2,
            animation: 'orbit-spin-cw 18s linear infinite',
            animationPlayState: animPlayState,
            background: 'conic-gradient(from 0deg, rgba(34,211,238,0.9), rgba(192,132,252,0.9), rgba(236,72,153,0.7), rgba(45,212,191,0.9), rgba(34,211,238,0.9))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
            filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.6))',
          }}
        />
        <div
          className="absolute rounded-full border-2 border-cyan-300/40"
          style={{
            inset: 10,
            animation: 'orbit-spin-ccw 28s linear infinite',
            animationPlayState: animPlayState,
            boxShadow: '0 0 12px rgba(34,211,238,0.35) inset',
          }}
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

        {/* Orbs — the whole ring continuously revolves around the hub; each orb's own
            content counter-rotates at the same rate so icons/labels stay upright while
            their position sweeps around the circle. Hover pauses the ring so they're
            actually easy to click rather than a moving target. */}
        <div
          className="absolute inset-0"
          onMouseEnter={() => setRingHovered(true)}
          onMouseLeave={() => setRingHovered(false)}
          style={{
            animation: `orbit-spin-cw ${ORBIT_DURATION}s linear infinite`,
            animationPlayState: ringPlayState,
          }}
        >
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
                  className="flex flex-col items-center gap-1.5"
                  style={{
                    animation: `orbit-spin-ccw ${ORBIT_DURATION}s linear infinite`,
                    animationPlayState: ringPlayState,
                  }}
                >
                  <div
                    className="neon-pulse w-16 h-16 rounded-full flex items-center justify-center border transition-transform duration-200 group-hover:scale-110"
                    style={{
                      '--glow-color': orb.glow,
                      backgroundColor: `${orb.glow}${orb.live ? '26' : '14'}`,
                      borderColor: `${orb.glow}${orb.live ? 'b3' : '59'}`,
                    } as React.CSSProperties}
                  >
                    <Icon className="w-6 h-6" style={{ color: orb.live ? orb.glow : `${orb.glow}80` }} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: orb.live ? orb.glow : '#6b7280' }}>{orb.label}</span>
                  {!orb.live && (
                    <span className="text-[9px] uppercase tracking-wider text-gray-600">Soon</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Ask bar — Control Center's signature is chase, matching the orbit motif */}
      <form onSubmit={submitAsk} className="relative z-10 w-full max-w-md mt-8">
        <div
          className="neon-chase flex items-center gap-2 bg-gray-900/70 border border-cyan-500/20 rounded-full px-4 py-2.5 backdrop-blur-sm"
          style={{ '--glow-color': '#22d3ee' } as React.CSSProperties}
        >
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
