'use client'

// The platform admin's account switcher. While set, lib/authFetch.ts sends the account's id
// on every /api request and proxy.ts scopes the request to it (platform admins only).
// Kept in localStorage so it survives reloads; cleared on sign-out.

export interface SwitchedAccount { id: string; name: string; slug: string; hidden_features: string[] }

const KEY = 'dialer_act_as'

export function getSwitchedAccount(): SwitchedAccount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as SwitchedAccount : null
  } catch { return null }
}

export function setSwitchedAccount(account: SwitchedAccount | null) {
  try {
    if (account) localStorage.setItem(KEY, JSON.stringify(account))
    else localStorage.removeItem(KEY)
  } catch { /* storage unavailable */ }
}

// Validates and logs the switch server-side, stores it, and reloads so every page refetches
// its data for the new account.
export async function switchAccount(tenantId: string | null): Promise<string | null> {
  const res = await fetch('/api/platform/act-as', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tenantId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return data.error || 'Could not switch accounts.'
  setSwitchedAccount(data.tenant ?? null)
  window.location.reload()
  return null
}
