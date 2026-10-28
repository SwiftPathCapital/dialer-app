import { callableStatesNow } from './callingHours'

// Lead statuses that permanently remove a lead from the dialing queue.
export const QUEUE_EXCLUDED_STATUSES = ['DNC', 'Not Interested', 'Wrong Number', 'App Received', 'Docs Received', 'Pending App & Docs', 'Deal Funded']

export const COOLDOWN_MS = 8 * 60 * 60 * 1000

export interface LeadFilterOpts {
  agentId: string | null
  phone: string
  search: string
  tenantId: string | null
  // Predictive dialing pulls from the whole tenant pool: unassigned leads plus leads assigned
  // to any of these agents. When set, the per-agent assignment filter is replaced by this.
  assignedToAnyOf?: string[]
}

// Shared by the Softphone queue (/api/leads) and the predictive pacer so both use exactly
// the same eligibility rules: tenant, assignment, enabled lead sources, 8-hour cooldown,
// dead statuses, and calling hours in the lead's own time zone.
// Add .order()/.limit() to the query BEFORE calling this: query builders are thenables, so
// awaiting this async function executes the query and resolves to { data, error }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyLeadFilters(db: any, query: any, opts: LeadFilterOpts): Promise<any> {
  const { agentId, phone, search, tenantId, assignedToAnyOf } = opts

  if (tenantId) query = query.eq('tenant_id', tenantId)

  if (phone) {
    query = query.ilike('phone', `%${phone}%`)
  } else if (search) {
    // A plain contact search (e.g. picking an existing customer for a new moisture
    // mapping project) — intentionally skips the dialer-queue-eligibility filters
    // below (DNC, cooldown, assignment, enabled sources) since those describe "who's
    // next to call," not "does this contact exist." A DNC'd or already-called contact
    // should still be findable by name/phone.
    query = query.or(`company_name.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`)
  } else if (agentId || assignedToAnyOf) {
    if (assignedToAnyOf) {
      query = assignedToAnyOf.length
        ? query.or(`assigned_to.is.null,assigned_to.in.(${assignedToAnyOf.join(',')})`)
        : query.is('assigned_to', null)
    } else {
      // Agents with can_view_all_leads see the full pool; others only their
      // assigned leads plus unassigned ones.
      const { data: agentRow } = await db
        .from('agents')
        .select('can_view_all_leads')
        .eq('id', agentId)
        .single()

      if (!agentRow?.can_view_all_leads) {
        query = query.or(`assigned_to.eq.${agentId},assigned_to.is.null`)
      }
    }

    let sourcesQuery = db.from('lead_sources').select('name').eq('enabled', true)
    if (tenantId) sourcesQuery = sourcesQuery.eq('tenant_id', tenantId)
    const { data: sourceRows } = await sourcesQuery

    const activeSources = (sourceRows ?? []).map((r: { name: string }) => r.name)

    if (activeSources.length > 0) {
      query = query.in('lead_type', activeSources)
    }

    // Exclude leads called in the last 8 hours, and leads whose local time is outside
    // calling hours right now. Combined into one `or` param — PostgREST needs nested
    // and()/or() here because a lead with no state must still pass the state test when
    // the "unknown time zone" window is open.
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString()
    const { states, unknownOk } = callableStatesNow()
    const stateList = `state.in.(${states.join(',')})`
    const stateExpr = unknownOk ? `or(state.is.null,${stateList})` : stateList
    query = query.or(`and(or(last_called_at.is.null,last_called_at.lt.${cooldownCutoff}),${stateExpr})`)

    // Permanently exclude leads that should never be called again
    query = query.not('status', 'in', `(${QUEUE_EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)
  }

  return query
}
