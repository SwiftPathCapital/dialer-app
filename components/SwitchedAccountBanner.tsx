'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Eye, Loader2 } from 'lucide-react'
import { getSwitchedAccount, switchAccount, type SwitchedAccount } from '@/lib/actAs'

// Always-visible reminder while the platform admin is working inside a client's account.
export default function SwitchedAccountBanner() {
  const pathname = usePathname()
  const [account, setAccount] = useState<SwitchedAccount | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => { setAccount(getSwitchedAccount()) }, [])

  if (!account || pathname === '/login' || pathname?.startsWith('/book/')) return null

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-3 border-b border-amber-400/30 bg-amber-500/15 px-4 py-2 text-sm text-amber-100 backdrop-blur">
      <Eye className="w-4 h-4 shrink-0 text-amber-300" />
      <span>You&apos;re working in <strong className="font-semibold">{account.name}</strong>. Changes you make apply to their account.</span>
      <button
        onClick={async () => { setLeaving(true); if (await switchAccount(null)) setLeaving(false) }}
        disabled={leaving}
        className="flex items-center gap-1 rounded-md bg-amber-400/20 px-2.5 py-1 text-xs font-medium text-amber-50 hover:bg-amber-400/30 disabled:opacity-60"
      >
        {leaving && <Loader2 className="w-3 h-3 animate-spin" />}
        Back to my account
      </button>
    </div>
  )
}
