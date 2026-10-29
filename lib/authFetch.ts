'use client'

import { supabase } from './supabase'

// Adds the signed-in user's Supabase access token to every same-origin /api request, so
// proxy.ts can verify who is calling. Installed once at module load (see SoftphoneContext)
// so it's in place before any page's first fetch. supabase-js refreshes the token itself.

let installed = false

function signOutLocally() {
  try {
    localStorage.removeItem('dialer_agent')
    localStorage.removeItem('dialer_agent_expires')
  } catch { /* storage unavailable */ }
  const path = window.location.pathname
  if (path !== '/' && path !== '/login' && !path.startsWith('/book/')) window.location.href = '/login'
}

export function installAuthFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    let url: URL
    try { url = new URL(raw, window.location.origin) } catch { return original(input, init) }
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return original(input, init)

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)

    const res = await original(input, { ...init, headers })
    if (res.status === 401) {
      const body = await res.clone().json().catch(() => null)
      if (body?.code === 'session_required') signOutLocally()
    }
    return res
  }
}
