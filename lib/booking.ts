// Pure booking-slot math (no I/O) — shared by the public booking API and its tests.

export type WeeklyHours = Record<string, [string, string][]> // weekday "0"(Sun)–"6" → [["09:00","17:00"], ...]

export interface BookingRules {
  duration_minutes: number
  buffer_minutes: number
  min_notice_minutes: number
  max_days_ahead: number
  timezone: string
  weekly_hours: WeeklyHours
}

export interface Interval { start: number; end: number } // epoch ms, end exclusive

export const DEFAULT_EVENT_MINUTES = 30
const MIN = 60_000

// Offset of `timeZone` from UTC at instant `utcMs`, in ms (e.g. New York in summer = -4h).
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

// Wall-clock time in `timeZone` → epoch ms. Two passes so DST transitions resolve correctly.
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let utc = guess - tzOffsetMs(guess, timeZone)
  utc = guess - tzOffsetMs(utc, timeZone)
  return utc
}

// Calendar date (y, m, d, weekday) of instant `utcMs` as seen in `timeZone`.
export function zonedDate(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(utcMs))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), weekday: wd }
}

export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

function hm(s: string): [number, number] | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s)
  return m ? [Number(m[1]), Number(m[2])] : null
}

export function validateWeeklyHours(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'weekly_hours must be an object'
  for (const [day, windows] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day)) return `Unknown weekday ${day}`
    if (!Array.isArray(windows)) return 'Each day needs a list of time windows'
    for (const w of windows) {
      if (!Array.isArray(w) || w.length !== 2) return 'Each window is [start, end]'
      const a = hm(String(w[0])), b = hm(String(w[1]))
      if (!a || !b) return 'Times must be HH:MM (24-hour)'
      if (a[0] * 60 + a[1] >= b[0] * 60 + b[1]) return 'Each window must end after it starts'
    }
  }
  return null
}

// Every bookable start time, as epoch ms, from `now` through max_days_ahead. A slot is
// offered only if [start - buffer, start + duration + buffer) is clear of every busy
// interval and the start is at least min_notice away. Slots step by the meeting length.
export function generateSlots(rules: BookingRules, busy: Interval[], now = Date.now()): number[] {
  const out: number[] = []
  const earliest = now + rules.min_notice_minutes * MIN
  const step = rules.duration_minutes * MIN
  const pad = rules.buffer_minutes * MIN
  const today = zonedDate(now, rules.timezone)
  const startDay = Date.UTC(today.y, today.m - 1, today.d)

  for (let i = 0; i <= rules.max_days_ahead; i++) {
    const day = new Date(startDay + i * 24 * 60 * MIN)
    const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate()
    const weekday = day.getUTCDay()
    for (const [a, b] of rules.weekly_hours[String(weekday)] ?? []) {
      const s = hm(a), e = hm(b)
      if (!s || !e) continue
      const winStart = zonedToUtc(y, mo, d, s[0], s[1], rules.timezone)
      const winEnd = zonedToUtc(y, mo, d, e[0], e[1], rules.timezone)
      for (let t = winStart; t + step <= winEnd; t += step) {
        if (t < earliest) continue
        const block = { start: t - pad, end: t + step + pad }
        if (!busy.some(x => x.start < block.end && block.start < x.end)) out.push(t)
      }
    }
  }
  return out
}

export function isSlotAvailable(rules: BookingRules, busy: Interval[], startMs: number, now = Date.now()): boolean {
  return generateSlots(rules, busy, now).includes(startMs)
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'booking'
}
