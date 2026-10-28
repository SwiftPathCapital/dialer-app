// Pure pacing math for the predictive dialer — no I/O, so it can be unit-tested directly.

export interface PacingInput {
  readyAgents: number        // idle agents with a live connection, not on a call
  inFlight: number           // lead calls placed but not yet connected or ended
  answerRate: number | null  // share of recent finished attempts a person answered; null = not enough data yet
  abandonRatePct: number     // rolling 30-day abandoned / answered-by-a-person, as a percent
  abandonTargetPct: number   // the client's ceiling (≤ 3, the FTC safe-harbor limit)
  maxRatio: number           // most lines per ready agent the client allows (1–3)
}

export const MIN_ANSWER_RATE = 0.05

// Lines per ready agent: 1 / answer rate (so on average one person answers per free
// agent), capped at maxRatio. Overdialing tapers off linearly once the 30-day abandon rate
// passes half the target and stops entirely (one line per agent) at the target. With no
// answer-rate history yet it starts at one line per agent.
export function dialRatio(i: PacingInput): number {
  if (i.abandonRatePct >= i.abandonTargetPct || i.answerRate === null) return 1
  const raw = Math.min(i.maxRatio, Math.max(1, 1 / Math.max(i.answerRate, MIN_ANSWER_RATE)))
  const soft = i.abandonTargetPct * 0.5
  const headroom = 1 - Math.min(1, Math.max(0, (i.abandonRatePct - soft) / (i.abandonTargetPct - soft)))
  return 1 + (raw - 1) * headroom
}

export function linesToDial(i: PacingInput): number {
  if (i.readyAgents <= 0) return 0
  // Floor, not round: with one agent this never overdials until the ratio reaches 2.
  const target = Math.floor(i.readyAgents * dialRatio(i) + 1e-9)
  return Math.max(0, target - i.inFlight)
}

// TSR definition: abandoned calls as a share of calls answered by a person.
export function abandonRatePct(humanAnswered: number, abandoned: number): number {
  return humanAnswered > 0 ? (abandoned / humanAnswered) * 100 : 0
}

export const MIN_ANSWER_SAMPLES = 20

// Attempt lifecycle: dialing → no_answer | busy | failed (never picked up)
//                    dialing → answered → connected | abandoned | machine | ended
// "connected" and "abandoned" keep their status after hangup (ended_at is set), so they
// are exactly the calls a person answered. "ended" = hung up before we could tell.
export const HUMAN_ANSWERED_STATUSES = ['connected', 'abandoned']
export const FINISHED_STATUSES = ['no_answer', 'busy', 'failed', 'connected', 'abandoned', 'machine', 'ended']

export function answerRateFrom(finished: { status: string }[]): number | null {
  if (finished.length < MIN_ANSWER_SAMPLES) return null
  const human = finished.filter(a => HUMAN_ANSWERED_STATUSES.includes(a.status)).length
  return human / finished.length
}
