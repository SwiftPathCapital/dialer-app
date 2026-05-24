import Telnyx from 'telnyx'
import { createServerClient } from './supabase'

async function getConfigValue(key: string): Promise<string | null> {
  const db = createServerClient()
  const { data } = await db.from('app_config').select('value').eq('key', key).single()
  return data?.value ?? null
}

export async function getTelnyxClient(): Promise<Telnyx> {
  const apiKey = (await getConfigValue('telnyx_api_key')) || process.env.TELNYX_API_KEY || ''
  return new Telnyx({ apiKey })
}

export async function getAppUrl(): Promise<string> {
  return (await getConfigValue('app_url')) || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export function agentSipUri(sip_username: string, sip_connection_id: string | null): string {
  const domain = sip_connection_id ? `${sip_connection_id}.sip.telnyx.com` : 'sip.telnyx.com'
  return `sip:${sip_username}@${domain}`
}
