import { createClient } from '@supabase/supabase-js'

// Lazy singleton — deferred so Next.js build-time module evaluation
// doesn't require env vars to be present at compile time.
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
