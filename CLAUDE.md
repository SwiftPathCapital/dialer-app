# Apex Dialer — Claude Code Context

## What this project is
A multi-tenant, browser-based dialer and contact-center app run by **Apex Development & Marketing** as an agency. Each client business is a **tenant** (e.g. SwiftPath Capital, Sunlight Contractors) with its own agents, leads, calls, numbers and settings. Next.js app deployed on Railway, backed by one Supabase project, telephony on Telnyx.

There is **no other app sharing this Supabase project** today. (Older notes described a shared "Apex CRM / crm-skeleton" Electron app and a CRM-owned `calls` table — both are gone. The current Apex CRM is a separate system.)

---

## ⛔ Rules

### Database
1. **Check before changing schema.** Use the Supabase MCP (`list_tables`, or query `information_schema`) before any new table/column/index/policy. The live DB has drifted from `supabase/schema.sql`.
2. **Never run `supabase/schema.sql`** as a whole file — it's a historical setup doc and would try to recreate existing tables.
3. **No DROP / TRUNCATE / recreate of existing tables, and no RLS policy changes** without explicit user confirmation.
4. **New dialer tables use the `dialer_` prefix**, carry `tenant_id uuid not null references tenants(id)`, enable RLS, and get the standard read-only policy (see "Multi-tenancy" below). Writes go through server routes with the service role.
5. **`agents.id` must equal an `auth.users.id`.** Create logins through the app's **Clients page** (`POST /api/platform/tenants`, uses the Supabase Admin API) — never by inserting a bare `agents` row with a generated UUID.

### Code
6. **Never rename environment variables** (Railway breaks silently). Current names are listed below.
7. **Live-call webhooks (`app/api/webhooks/voice/*`, `app/api/webhooks/sms`) need extra care** — a bug drops calls for every tenant. Read the TeXML notes below first, and when refactoring, diff old vs. new behavior.
8. **Don't add npm packages without asking.**
9. **Don't push or deploy unless the user asks.** Commit locally; propose.

---

## Stack
- **Next.js 16** App Router, **React 19**, TypeScript, **Tailwind 4**
- **Supabase** (`@supabase/supabase-js`) — Postgres, Auth, Realtime; `pg_cron` + `pg_net` enabled
- **Telnyx** — browser softphone via `@telnyx/webrtc`; voice routing via TeXML webhooks; SMS + REST via `telnyx` SDK / v2 API
- `@xyflow/react` (workflow canvas), `lucide-react` (icons)

## Accounts & roles
- **Super admin (platform admin):** `agents.is_platform_admin = true`. Currently only the Apex account (`jordan@apexdevelopmentandmarketing.com`, tenant "Apex Development & Marketing"). Sees **Admin → Clients** (`/admin/tenants`): create clients, toggle each client's visible pages (`tenants.hidden_features`).
- **Client admin:** `role = 'admin'` within a tenant — sees that tenant's admin pages only.
- **Agent:** `role = 'agent'`.
- Planned: a super-admin account switcher to open any client account from the Apex login (requires server-side auth first — see below).

## Auth — current state and known gap
- Login (`app/login`) uses `supabase.auth.signInWithPassword`, then loads the `agents` row into React context + `localStorage` (8-hour expiry) and sets HttpOnly cookies via `/api/auth/session`.
- ⚠️ **API routes do not verify the session.** They trust an `agent_id` sent by the browser and resolve the tenant from it (`getAgentTenantId`). Several routes return **all tenants'** data when `agent_id` is omitted. The only server-checked permission today is `is_platform_admin` on `/api/platform/*`. Fixing this (verify the Supabase JWT, derive agent + tenant from it) is the top security to-do — do not give outside parties logins until it's done.

## Multi-tenancy
- `tenants` table; almost every table has `tenant_id` (default = SwiftPath's id for legacy rows).
- Server routes scope queries with `getAgentTenantId(db, agentId)` from `lib/supabase.ts`.
- Standard RLS select policy for tenant tables:
  ```sql
  using ((select auth.role()) = 'authenticated'
     and tenant_id = (select a.tenant_id from agents a where a.id = (select auth.uid())))
  ```
- Webhooks resolve the tenant from the **dialed number** (group number → agent DID), then stamp that tenant on every row they write.
- `app_config` is keyed `(tenant_id, key)`. **Gotcha:** `getConfigValue()` in `lib/telnyx.ts` reads by key only with `.single()`. The Telnyx keys currently live under the SwiftPath tenant and serve every tenant; if a second tenant saves a `telnyx_api_key`, that lookup errors app-wide. Fix before per-tenant Telnyx config.

## Main features
- **Softphone / dialer queue** (`/dashboard`): per-agent Telnyx WebRTC softphone; queue = never-called first, then longest-since-called; 8-hour cooldown after a call/disposition; dead statuses excluded; wrap-up (notes → disposition), callbacks, tags, new-lead capture for unknown numbers.
- **Inbound groups** — parallel ring to non-offline members, voicemail fallback; direct agent DID lines.
- **Contact Center** (`/contact-center`) — unified SMS/call threads; **Voicemail**, **Call Log**, **Callbacks**, **Calendar** (team calendars, per-calendar SMS reminders).
- **Admin:** Monitor/barge, Analytics (per-agent stats + report builder with CSV export and scheduled email), Call Center recordings, Calendars, **Workflows** (disposition-triggered automations, `@xyflow/react` canvas), Groups, Tags, Config (Telnyx keys in `app_config`).
- **Moisture Mapping** (`/moisture-mapping`) — floor-plan moisture tracking per contact (tenant feature).
- **Apex Tap** (`/apex-tap`) — NFC tag ops panel backed by a **separate** Supabase project (`APEXTAP_*` env vars, `lib/apexTapSupabase.ts`).
- Placeholder pages (`ComingSoon`): ads-manager, deals, reporting, reputation, social, tasks, web-admin.

## Scheduled jobs (Supabase `pg_cron` → `pg_net` → app)
| Job | Schedule | Route | Header / secret |
|---|---|---|---|
| `dialer-reminder-dispatch` | every 5 min | `POST /api/reminders/dispatch` | `x-reminder-secret` = `REMINDER_DISPATCH_SECRET` |
| `dialer-report-dispatch` | hourly | `POST /api/reports/dispatch` | `x-report-secret` = `REPORT_DISPATCH_SECRET` |

Email sending (`lib/email.ts`) is a **stub that throws** until a provider is connected; callers catch and log.

## Supabase tables (public)
`activities, agents, app_config, calendar_groups, calendar_members, calendar_visibility, calendars, dialer_callbacks, dialer_calls, dialer_reminder_log, dialer_report_schedules, dialer_workflows, inbound_group_members, inbound_groups, lead_comments, lead_sources, lead_tags, leads, moisture_projects, moisture_reading_points, moisture_readings, sms_conversations, sms_messages, tags, tenants, voicemails`

Also live, used by the local presence / predictive dialer work (PR #3): `dialer_tenant_settings, dialer_caller_ids, dialer_agent_sessions, dialer_dial_attempts`.

Notes: `dialer_calls` rows with null `telnyx_call_control_id` are ghost rows from an old double-POST bug — exclude them from stats. PostgREST returns at most 1,000 rows per request; page with `.range()` for anything that can exceed that.

## Environment variables (Railway service `dialer-app`, project `fearless-passion`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APEXTAP_SUPABASE_URL`, `APEXTAP_SUPABASE_SERVICE_ROLE_KEY`, `REMINDER_DISPATCH_SECRET`, `REPORT_DISPATCH_SECRET`, optional `NEXT_PUBLIC_APP_URL` / `TELNYX_API_KEY` fallbacks. Telnyx keys and the app URL normally come from `app_config` (Admin → Config).

Use dot notation for `NEXT_PUBLIC_*` (`process.env.NEXT_PUBLIC_X`) — bracket access isn't inlined into the client bundle.

---

## Telephony gotchas

### SIP URI for WebRTC agents
Always `sip:username@sip.telnyx.com`. The connection-specific domain (`username@<connection_id>.sip.telnyx.com`) routes through Telnyx's URL-calling webhook instead of the WebRTC client and returns `busy`. `agentSipUri()` in `lib/telnyx.ts` falls back to `sip.telnyx.com` when `sip_connection_id` is null — keep that column NULL.

### Remote audio must be attached manually
The WebRTC SDK doesn't create an `<audio>` element. On `call.state === 'active'`, attach `call.remoteStream`:
```typescript
const audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
  ?? Object.assign(document.createElement('audio'), { id: 'telnyx-remote-audio', autoplay: true })
document.body.appendChild(audio)
audio.srcObject = call.remoteStream
audio.play().catch(console.error)
```
Clean up on `hangup`/`destroy` (`srcObject = null`, remove the element).

### Mic device on Windows
Chrome may default to "Stereo Mix (Realtek)" (loopback) → silent outbound audio and echo cancellation kills inbound too. Fix: Windows Sound → Recording → set the real mic as default, disable Stereo Mix.

### Webhook method
TeXML webhooks can arrive as GET (query string) or POST (form-encoded). Voice routes handle both via `getParams()`. Never write a voice route that handles only one.

### TeXML `<Dial action=...>`
With an `action` attribute, Telnyx jumps to that URL when the dial ends; verbs after `</Dial>` never run. So voicemail fallback lives in `app/api/webhooks/voice/status/route.ts` (checks `DialCallStatus`), not in the main route.

### Outbound calls
Placed in the browser (`makeCall` in `lib/SoftphoneContext.tsx`); the app writes the `dialer_calls` row and duration itself because no TeXML status webhook fires for them.

## React pattern: wait for `agentLoading`
`SoftphoneContext` restores the agent from localStorage asynchronously. Redirect only after it finishes:
```typescript
const { agent, agentLoading } = useSoftphone()
useEffect(() => {
  if (agentLoading) return
  if (!agent) { router.push('/login'); return }
  // ... load page data
}, [agent, agentLoading, router])
```

## Supabase query gotcha
Query builders are thenables. If a helper is `async` and takes a builder (e.g. `applyLeadFilters`), add `.order()` / `.limit()` **before** awaiting it — awaiting runs the query.

## Dev
```bash
npm run dev            # http://localhost:3000
npx tsc --noEmit       # typecheck
npm run build
```
Needs `.env.local` with the Supabase variables above.
