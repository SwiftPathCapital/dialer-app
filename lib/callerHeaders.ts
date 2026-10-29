// Request headers the proxy sets after verifying the caller's Supabase session. The proxy
// strips any incoming copies first, so route code can trust them. No imports here — the
// proxy and server routes both use this file.
export const CALLER_HEADERS = {
  id: 'x-caller-id',
  tenant: 'x-caller-tenant',
  role: 'x-caller-role',
  platformAdmin: 'x-caller-platform-admin',
  // The caller's own tenant. Differs from `tenant` only while a platform admin is working
  // inside another account through the account switcher.
  homeTenant: 'x-caller-home-tenant',
} as const

// Sent by the browser (lib/authFetch.ts) while a platform admin has switched into another
// account. The proxy honors it only for platform admins, for a tenant that exists.
export const ACT_AS_HEADER = 'x-act-as-tenant'

// Routes reachable without a signed-in user. Each has its own protection:
//  - webhooks: called by Telnyx
//  - book: public booking pages (rate-limited, expose only open times)
//  - reminders/reports dispatch: shared-secret header from pg_cron
//  - auth/session: sets cookies right after Supabase sign-in
export const PUBLIC_API_PREFIXES = [
  '/api/webhooks/',
  '/api/book/',
  '/api/reminders/dispatch',
  '/api/reports/dispatch',
  '/api/auth/session',
]

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(p => p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`))
}
