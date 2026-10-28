import type { createServerClient } from './supabase'

type Db = ReturnType<typeof createServerClient>

export interface DialerSettings {
  tenant_id: string
  local_presence_enabled: boolean
  local_presence_sms_enabled: boolean
  power_dialer_enabled: boolean
  predictive_enabled: boolean
  callback_mode: 'last_agent' | 'group'
  callback_group_id: string | null
  wrap_up_seconds: number
  predictive_max_ratio: number
  predictive_abandon_target_pct: number
  predictive_amd_enabled: boolean
  business_name: string | null
}

// A tenant with no settings row gets these — every add-on off, so existing clients are
// unaffected until someone turns a feature on for them.
export function defaultSettings(tenantId: string): DialerSettings {
  return {
    tenant_id: tenantId,
    local_presence_enabled: false,
    local_presence_sms_enabled: false,
    power_dialer_enabled: false,
    predictive_enabled: false,
    callback_mode: 'last_agent',
    callback_group_id: null,
    wrap_up_seconds: 15,
    predictive_max_ratio: 2,
    predictive_abandon_target_pct: 2,
    predictive_amd_enabled: false,
    business_name: null,
  }
}

export const SETTINGS_COLUMNS = 'tenant_id, local_presence_enabled, local_presence_sms_enabled, power_dialer_enabled, predictive_enabled, callback_mode, callback_group_id, wrap_up_seconds, predictive_max_ratio, predictive_abandon_target_pct, predictive_amd_enabled, business_name'

export async function getDialerSettings(db: Db, tenantId: string): Promise<DialerSettings> {
  const { data } = await db.from('dialer_tenant_settings').select(SETTINGS_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return defaultSettings(tenantId)
  return {
    ...defaultSettings(tenantId),
    ...data,
    predictive_max_ratio: Number(data.predictive_max_ratio),
    predictive_abandon_target_pct: Number(data.predictive_abandon_target_pct),
  } as DialerSettings
}

// Which fields each kind of admin may change. Turning paid add-ons on/off is the platform
// admin's call; a client's own admin manages day-to-day behavior of what's been turned on.
export const PLATFORM_ONLY_FIELDS = ['local_presence_enabled', 'local_presence_sms_enabled', 'power_dialer_enabled', 'predictive_enabled'] as const
export const TENANT_ADMIN_FIELDS = ['callback_mode', 'callback_group_id', 'wrap_up_seconds', 'predictive_max_ratio', 'predictive_abandon_target_pct', 'predictive_amd_enabled', 'business_name'] as const

export function validateSettingsPatch(patch: Record<string, unknown>): string | null {
  for (const key of PLATFORM_ONLY_FIELDS) {
    if (key in patch && typeof patch[key] !== 'boolean') return `${key} must be true or false`
  }
  if ('predictive_amd_enabled' in patch && typeof patch.predictive_amd_enabled !== 'boolean') return 'predictive_amd_enabled must be true or false'
  if ('callback_mode' in patch && !['last_agent', 'group'].includes(patch.callback_mode as string)) return 'callback_mode must be last_agent or group'
  if ('callback_group_id' in patch && patch.callback_group_id !== null && typeof patch.callback_group_id !== 'string') return 'callback_group_id must be a group id or null'
  if ('wrap_up_seconds' in patch) {
    const n = patch.wrap_up_seconds
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 300) return 'wrap_up_seconds must be 0–300'
  }
  if ('predictive_max_ratio' in patch) {
    const n = Number(patch.predictive_max_ratio)
    if (!Number.isFinite(n) || n < 1 || n > 3) return 'predictive_max_ratio must be between 1 and 3'
  }
  if ('predictive_abandon_target_pct' in patch) {
    const n = Number(patch.predictive_abandon_target_pct)
    if (!Number.isFinite(n) || n <= 0 || n > 3) return 'predictive_abandon_target_pct must be above 0 and at most 3'
  }
  if ('business_name' in patch && patch.business_name !== null && typeof patch.business_name !== 'string') return 'business_name must be text'
  return null
}
