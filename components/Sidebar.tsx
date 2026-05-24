'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Phone, MessageSquare, Voicemail, Users, SlidersHorizontal, LogOut, Wifi, WifiOff, PhoneCall } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'

const NAV = [
  { href: '/dashboard', icon: Phone, label: 'Softphone' },
  { href: '/sms', icon: MessageSquare, label: 'SMS' },
  { href: '/voicemail', icon: Voicemail, label: 'Voicemail' },
]

const ADMIN_NAV = [
  { href: '/admin/calls', icon: PhoneCall, label: 'Call Center' },
  { href: '/admin/groups', icon: Users, label: 'Groups' },
  { href: '/admin/config', icon: SlidersHorizontal, label: 'Config' },
]

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-500',
  busy: 'bg-yellow-500',
  offline: 'bg-gray-500',
}

export default function Sidebar() {
  const pathname = usePathname()
  const { agent, setAgent, connected } = useSoftphone()

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
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
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

        {/* Admin section */}
        <div className="mt-auto pt-4 border-t border-gray-700 space-y-0.5">
          <p className="hidden md:block text-gray-600 text-xs uppercase tracking-widest px-3 pb-1">Admin</p>
          {ADMIN_NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
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
      </nav>

      {/* Agent status + connection */}
      {agent && (
        <div className="border-t border-gray-700 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]}`} />
            <span className="hidden md:block text-gray-300 text-xs truncate">{agent.name}</span>
            <span className="ml-auto hidden md:flex items-center gap-1 text-xs text-gray-500">
              {connected ? (
                <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-400">Live</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-red-400">Off</span></>
              )}
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors w-full"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden md:block">Sign out</span>
          </button>
        </div>
      )}
    </aside>
  )
}
