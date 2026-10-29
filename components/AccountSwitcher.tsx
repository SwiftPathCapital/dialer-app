'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Loader2, Search, Building2 } from 'lucide-react'
import { useSoftphone } from '@/lib/SoftphoneContext'
import { getSwitchedAccount, switchAccount, type SwitchedAccount } from '@/lib/actAs'

interface TenantRow { id: string; name: string; slug: string; agent_count: number }

// Platform admin only: the arrow next to the logo opens every client account; picking one
// works inside it from this login (see lib/actAs.ts). The sidebar clips overflow, so the
// menu is positioned with `fixed` from the button's on-screen position.
export default function AccountSwitcher({ collapsed }: { collapsed: boolean }) {
  const { agent } = useSoftphone()
  const [open, setOpen] = useState(false)
  const [tenants, setTenants] = useState<TenantRow[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState<SwitchedAccount | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setCurrent(getSwitchedAccount()) }, [])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (!agent?.is_platform_admin) return null
  const homeId = agent.tenant_id

  function toggle() {
    if (!open) {
      const r = buttonRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, left: r.left })
      setError('')
      if (!tenants) {
        fetch('/api/platform/tenants')
          .then(r => r.json())
          .then(d => setTenants(Array.isArray(d) ? d : []))
          .catch(() => setError('Could not load accounts.'))
      }
    }
    setOpen(o => !o)
  }

  async function pick(id: string | null) {
    setBusy(id ?? 'home')
    const problem = await switchAccount(id === homeId ? null : id)
    if (problem) { setError(problem); setBusy(null) }
  }

  const activeId = current?.id ?? homeId
  const home = tenants?.find(t => t.id === homeId)
  const others = (tenants ?? [])
    .filter(t => t.id !== homeId)
    .filter(t => !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const row = (t: { id: string; name: string; agent_count?: number }, label?: string) => (
    <button
      key={t.id}
      onClick={() => pick(t.id)}
      disabled={!!busy}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
        activeId === t.id ? 'bg-cyan-500/15 text-cyan-100' : 'text-gray-300 hover:bg-white/5 hover:text-white'
      } disabled:opacity-60`}
    >
      <Building2 className="w-4 h-4 shrink-0 text-gray-500" />
      <span className="flex-1 truncate">{label ?? t.name}</span>
      {typeof t.agent_count === 'number' && <span className="text-xs text-gray-500">{t.agent_count}</span>}
      {busy === t.id || (busy === 'home' && t.id === homeId)
        ? <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
        : activeId === t.id && <Check className="w-4 h-4 text-cyan-300" />}
    </button>
  )

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        title={current ? `Working in ${current.name} — switch account` : 'Switch account'}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md py-1 text-xs transition-colors ${
          // In the 64px rail (collapsed, or any narrow screen) pin it to the right edge of the logo row.
          collapsed ? 'absolute right-1 top-1/2 -translate-y-1/2 px-0.5' : 'ml-auto mr-3 px-1.5 max-md:mr-0 max-md:absolute max-md:right-1 max-md:top-1/2 max-md:-translate-y-1/2 max-md:px-0.5'
        } ${
          current ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20' : 'text-gray-400 hover:text-cyan-200 hover:bg-cyan-500/10'
        }`}
      >
        {!collapsed && current && <span className="hidden md:inline max-w-[72px] truncate">{current.name}</span>}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-72 max-h-[70vh] flex flex-col rounded-xl border border-cyan-500/20 bg-[#0b1020] shadow-2xl shadow-black/60"
        >
          <div className="p-2 border-b border-white/5">
            <p className="px-1 pb-2 text-[11px] uppercase tracking-widest text-gray-500">Switch account</p>
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Find an account"
                className="w-full bg-transparent py-1.5 text-sm text-white placeholder-gray-500 outline-none"
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1">
            {!tenants && !error && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-cyan-300" /></div>}
            {tenants && row({ id: homeId, name: home?.name ?? 'My account', agent_count: home?.agent_count }, `${home?.name ?? 'My account'} (you)`)}
            {tenants && others.length > 0 && <div className="my-1 border-t border-white/5" />}
            {others.map(t => row(t))}
            {tenants && !others.length && query && <p className="px-3 py-3 text-sm text-gray-500">No accounts match.</p>}
          </div>
          {error && <p className="px-3 py-2 text-xs text-pink-300 border-t border-white/5">{error}</p>}
        </div>
      )}
    </>
  )
}
