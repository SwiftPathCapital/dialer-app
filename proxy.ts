import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CALLER_HEADERS, isPublicApiPath } from './lib/callerHeaders'

// Every /api request except the public ones must carry a Supabase access token
// (Authorization: Bearer …, added by lib/authFetch.ts in the browser). The token is
// verified with Supabase Auth, the agent row is loaded, and the result is passed to the
// route in x-caller-* headers. Incoming x-caller-* headers are always stripped first.

interface CallerInfo { id: string; tenantId: string; role: string; isPlatformAdmin: boolean }

const CACHE_MS = 30_000
const cache = new Map<string, { info: CallerInfo | null; until: number }>()

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function resolveCaller(token: string): Promise<CallerInfo | null> {
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.info

  const db = serviceClient()
  const { data: userData, error } = await db.auth.getUser(token)
  // Only a token Supabase actually rejects means "signed out". Anything else (network error,
  // Supabase 5xx) must not log everyone out — throw so the caller answers 503 and the
  // browser keeps its session.
  if (error && !(error.status && error.status >= 400 && error.status < 500)) throw error
  let info: CallerInfo | null = null
  if (!error && userData?.user) {
    const { data: agent } = await db
      .from('agents')
      .select('id, tenant_id, role, is_platform_admin')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (agent?.tenant_id) {
      info = { id: agent.id, tenantId: agent.tenant_id, role: agent.role, isPlatformAdmin: !!agent.is_platform_admin }
    }
  }
  if (cache.size > 2000) cache.clear()
  cache.set(token, { info, until: Date.now() + (info ? CACHE_MS : 5_000) })
  return info
}

const deny = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status })

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const forwarded = new Headers(req.headers)
  for (const h of Object.values(CALLER_HEADERS)) forwarded.delete(h)

  if (isPublicApiPath(path)) return NextResponse.next({ request: { headers: forwarded } })

  const auth = req.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return deny(401, 'Please sign in again.', 'session_required')

  let caller: CallerInfo | null
  try {
    caller = await resolveCaller(token)
  } catch (err) {
    console.error('[proxy] could not verify session', err)
    return deny(503, 'Could not verify your sign-in. Try again in a moment.')
  }
  if (!caller) return deny(401, 'Please sign in again.', 'session_required')

  const admin = caller.role === 'admin' || caller.isPlatformAdmin
  if (path.startsWith('/api/platform/') && !caller.isPlatformAdmin) return deny(403, 'Super admin only.')
  // Agents read the tag list on the Softphone and lead panel; every other admin endpoint is admins only.
  const agentReadable = req.method === 'GET' && path === '/api/admin/tags'
  if (path.startsWith('/api/admin/') && !admin && !agentReadable) return deny(403, 'Admins only.')

  forwarded.set(CALLER_HEADERS.id, caller.id)
  forwarded.set(CALLER_HEADERS.tenant, caller.tenantId)
  forwarded.set(CALLER_HEADERS.role, admin ? 'admin' : 'agent')
  forwarded.set(CALLER_HEADERS.platformAdmin, caller.isPlatformAdmin ? '1' : '0')
  return NextResponse.next({ request: { headers: forwarded } })
}

export const config = {
  matcher: ['/api/:path*'],
}
