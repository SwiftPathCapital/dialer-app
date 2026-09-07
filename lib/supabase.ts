import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      'Add it to .env.local for local dev or to your Railway service variables.'
    )
  }
  return val
}

// Lazy singleton — deferred so Next.js build-time module evaluation
// doesn't require env vars to be present at compile time.
// IMPORTANT: NEXT_PUBLIC_* vars must use dot notation (process.env.NEXT_PUBLIC_X)
// so Next.js statically replaces them in the client bundle. Bracket notation via
// a variable (process.env[name]) is not replaced and evaluates to undefined in the browser.
let _browser: ReturnType<typeof createClient> | null = null
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop: string) {
    if (!_browser) {
      _browser = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
    return (_browser as any)[prop]
  },
})

export function createServerClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
}

// Creates a client that operates as the given user (for RLS-respecting server routes).
// Uses the anon key + the user's JWT — auth.uid() resolves correctly inside Postgres policies.
export function createUserClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

// Multi-tenant scoping: every table query gets filtered by the requesting agent's own
// tenant_id, resolved server-side from their agent row rather than trusted from the client.
// Returns null if the agent doesn't exist (caller should treat that as "no access").
export async function getAgentTenantId(
  db: ReturnType<typeof createServerClient>,
  agentId: string
): Promise<string | null> {
  const { data } = await db.from('agents').select('tenant_id').eq('id', agentId).single()
  return data?.tenant_id ?? null
}
