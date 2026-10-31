// Calling-hours rules for outbound sales calls: 8am–9pm in the called party's local time
// (federal TCPA/TSR), with stricter windows for states whose own telemarketing laws are
// narrower. This list is a starting point, not legal advice — have counsel confirm it
// covers every state your clients dial, including any Sunday/holiday restrictions.
//
// Split-timezone states list every zone they span; a lead is callable only when the
// current time is inside the window in ALL of them, so a lead in the "wrong" half of the
// state is never called early or late.

interface Window { startMin: number; endMin: number }

const DEFAULT_WINDOW: Window = { startMin: 8 * 60, endMin: 21 * 60 }

export const STATE_WINDOW_OVERRIDES: Record<string, Window> = {
  FL: { startMin: 8 * 60, endMin: 20 * 60 }, // Florida Telephone Solicitation Act
  OK: { startMin: 8 * 60, endMin: 20 * 60 }, // Oklahoma Telephone Solicitation Act
  MD: { startMin: 8 * 60, endMin: 20 * 60 }, // Maryland Stop the Spam Calls Act
}

const ET = 'America/New_York', CT = 'America/Chicago', MT = 'America/Denver', PT = 'America/Los_Angeles'

export const STATE_TIMEZONES: Record<string, string[]> = {
  AL: [CT], AK: ['America/Anchorage', 'America/Adak'], AZ: ['America/Phoenix'], AR: [CT],
  CA: [PT], CO: [MT], CT: [ET], DE: [ET], DC: [ET], FL: [ET, CT], GA: [ET],
  HI: ['Pacific/Honolulu'], ID: ['America/Boise', PT], IL: [CT], IN: ['America/Indiana/Indianapolis', CT],
  IA: [CT], KS: [CT, MT], KY: [ET, CT], LA: [CT], ME: [ET], MD: [ET], MA: [ET],
  MI: ['America/Detroit', 'America/Menominee'], MN: [CT], MS: [CT], MO: [CT], MT: [MT],
  NE: [CT, MT], NV: [PT, MT], NH: [ET], NJ: [ET], NM: [MT], NY: [ET], NC: [ET],
  ND: [CT, MT], OH: [ET], OK: [CT], OR: [PT, 'America/Boise'], PA: [ET], RI: [ET], SC: [ET],
  SD: [CT, MT], TN: [ET, CT], TX: [CT, MT], UT: [MT], VT: [ET], VA: [ET], WA: [PT],
  WV: [ET], WI: [CT], WY: [MT],
  PR: ['America/Puerto_Rico'], VI: ['America/St_Thomas'], GU: ['Pacific/Guam'],
  MP: ['Pacific/Saipan'], AS: ['Pacific/Pago_Pago'],
}

// Only the area codes where guessing "continental US" would be dangerously wrong.
const AREA_CODE_STATE: Record<string, string> = {
  '808': 'HI', '907': 'AK', '787': 'PR', '939': 'PR', '340': 'VI', '671': 'GU', '670': 'MP', '684': 'AS',
}

// Used when a lead has no usable state: callable only when it's inside the window in every
// continental zone (roughly 11am–9pm Eastern).
const UNKNOWN_TIMEZONES = [ET, CT, MT, 'America/Phoenix', PT]

export function areaCodeOf(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return ten.length === 10 ? ten.slice(0, 3) : null
}

export function normalizeState(state: string | null | undefined): string | null {
  const s = (state || '').trim().toUpperCase()
  return STATE_TIMEZONES[s] ? s : null
}

export function resolveLeadState(state: string | null | undefined, phone?: string | null): string | null {
  return normalizeState(state) ?? (AREA_CODE_STATE[areaCodeOf(phone) ?? ''] || null)
}

function minutesInZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

function formatWindow(w: Window): string {
  const fmt = (min: number) => {
    const h = Math.floor(min / 60)
    return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`
  }
  return `${fmt(w.startMin)}–${fmt(w.endMin)}`
}

export interface CallableResult {
  ok: boolean
  state: string | null
  message?: string
}

export function isCallableNow(lead: { state?: string | null; phone?: string | null }, now = new Date()): CallableResult {
  const state = resolveLeadState(lead.state, lead.phone)
  const zones = state ? STATE_TIMEZONES[state] : UNKNOWN_TIMEZONES
  const window = (state && STATE_WINDOW_OVERRIDES[state]) || DEFAULT_WINDOW
  const ok = zones.every(tz => {
    const m = minutesInZone(now, tz)
    return m >= window.startMin && m < window.endMin
  })
  if (ok) return { ok: true, state }
  return {
    ok: false,
    state,
    message: state
      ? `Outside calling hours for ${state} (${formatWindow(window)} local time).`
      : `Outside calling hours — this lead has no state on file, so it can only be called when it's ${formatWindow(DEFAULT_WINDOW)} in every US time zone.`,
  }
}

// For filtering the dialer queue in one query: which state codes are callable right now,
// and whether leads with no state on file are.
export function callableStatesNow(now = new Date()): { states: string[]; unknownOk: boolean } {
  const states = Object.keys(STATE_TIMEZONES).filter(s => isCallableNow({ state: s }, now).ok)
  return { states, unknownOk: isCallableNow({ state: null }, now).ok }
}
