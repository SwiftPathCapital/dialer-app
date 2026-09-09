// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Apex Tap Solutions is a separate business with its own, fully isolated Supabase
// project — never the CRM-shared one (see lib/supabase.ts). This client is server-only
// (uses the service role key, bypassing RLS) because these routes are an internal ops
// panel for SwiftPath staff who are already authenticated via the dialer's own agent
// login — they don't have (and don't need) an Apex Tap customer account.
const APEXTAP_URL = process.env.APEXTAP_SUPABASE_URL || 'https://qbaubmexcmduhqmbixen.supabase.co'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: SupabaseClient<any, any, any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createApexTapServerClient(): SupabaseClient<any, any, any> {
  if (_client) return _client
  const key = process.env.APEXTAP_SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'Missing required environment variable: APEXTAP_SUPABASE_SERVICE_ROLE_KEY. ' +
      'Add it to .env.local for local dev or to your Railway service variables.'
    )
  }
  _client = createClient(APEXTAP_URL, key)
  return _client
}
