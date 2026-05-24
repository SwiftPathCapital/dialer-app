# SwiftPath Dialer — Claude Code Context

## What this project is
A standalone browser-based dialer app for SwiftPath Capital agents. Separate from the Electron CRM (crm-skeleton / Apex CRM) but shares the same Supabase project. Deployed on Railway.

## Stack
- **Framework:** Next.js 14 App Router (TypeScript)
- **Styling:** Tailwind CSS
- **Database:** Supabase (shared with the CRM)
- **Telephony:** Telnyx — voice via WebRTC (`@telnyx/webrtc`), SMS via Telnyx Node SDK
- **Icons:** lucide-react

## Key features
- Per-agent softphone (each agent has their own Telnyx SIP credential)
- Click-to-call outbound dialing
- Inbound groups with parallel ring + voicemail fallback
- Two-way SMS inbox with Supabase Realtime
- Voicemail inbox with audio playback
- Admin panel: manage groups, agents, and app config (Telnyx keys stored in DB)

## Project structure
- `app/` — Next.js App Router pages and API routes
- `app/api/webhooks/voice/` — Telnyx TeXML webhook handlers for call routing
- `app/api/webhooks/sms/` — Telnyx inbound SMS webhook
- `components/` — React UI components
- `lib/SoftphoneContext.tsx` — global React context for the TelnyxRTC client and call state
- `lib/supabase.ts` — Supabase client (browser + server variants)
- `lib/telnyx.ts` — async factory for Telnyx Node SDK (reads API key from `app_config` table)
- `supabase/schema.sql` — full DB schema to run in Supabase SQL editor

## Supabase tables
`agents`, `inbound_groups`, `inbound_group_members`, `dialer_calls`, `voicemails`, `sms_conversations`, `sms_messages`, `app_config`

### Shared Supabase — table collision warning
This Supabase project is shared with the Apex CRM. Several table names overlap. **Do not use generic names** — always use the `dialer_` prefix for new dialer tables. Known collisions:
- `calls` — belongs to the CRM (columns: `call_session_id`, `agent_id` as text, `lead_phone`, etc.). The dialer uses `dialer_calls` instead.
- `sms_conversations`, `sms_messages` — created by the dialer schema; CRM does not use these.

Before adding any new table, run `list_tables` via the Supabase MCP to check for conflicts.

## Environment variables
Supabase credentials go in `.env.local`. Telnyx keys are stored in the `app_config` Supabase table and managed via the `/admin/config` page — no redeploy needed to update them.

## Auth
No real auth yet (matches CRM Phase 1). Agents log in by email lookup against the `agents` table. Role-based access planned for a future phase.

## SIP URI for WebRTC agents
Always use `sip:username@sip.telnyx.com` for all agents. The connection-specific domain (`username@<connection_id>.sip.telnyx.com`) routes through Telnyx's URL calling webhook instead of delivering the INVITE directly to the WebRTC client — this causes `busy` and the call never reaches the browser. The `sip_connection_id` column exists on the `agents` table but all values are NULL; `agentSipUri()` in `lib/telnyx.ts` falls back to `sip.telnyx.com` when null. Do not populate `sip_connection_id` unless Telnyx changes this behavior.

## Remote audio — must be handled manually
The Telnyx WebRTC SDK does NOT create an `<audio>` element automatically. When `call.state === 'active'`, `call.remoteStream` is a live MediaStream that must be manually attached to an audio element or the caller will be completely inaudible. The pattern in `lib/SoftphoneContext.tsx`:
```typescript
const audio = document.getElementById('telnyx-remote-audio') as HTMLAudioElement
  ?? Object.assign(document.createElement('audio'), { id: 'telnyx-remote-audio', autoplay: true })
document.body.appendChild(audio)  // no-op if already attached
audio.srcObject = call.remoteStream
audio.play().catch(console.error)
```
Clean up on `hangup`/`destroy` by setting `srcObject = null` and removing the element.

## Mic device on Windows
Chrome on Windows may default to "Stereo Mix (Realtek)" — a loopback device — instead of the real microphone. This makes outgoing audio silent and triggers WebRTC echo cancellation to kill incoming audio too. If an agent reports two-way silence, have them check Windows Sound → Recording and set their actual microphone as default, then disable Stereo Mix.

## agentLoading — required before redirecting
`SoftphoneContext` restores the agent from localStorage asynchronously. Pages that call `router.push('/login')` when `!agent` must wait for `agentLoading === false` first, otherwise the redirect fires before the restore completes and causes "Router action dispatched before initialization". Pattern:
```typescript
const { agent, agentLoading } = useSoftphone()
useEffect(() => {
  if (agentLoading) return
  if (!agent) { router.push('/login'); return }
  // ... load page data
}, [agent, agentLoading, router])

## Telnyx webhook method
Telnyx TeXML webhooks can arrive as either GET (params in query string) or POST (params as `application/x-www-form-urlencoded` body) depending on how the TeXML application is configured. All voice webhook routes handle **both** via a shared `getParams()` helper that reads from `req.nextUrl.searchParams` (GET) or `req.text()` (POST). Never write a route that only handles one method.

## TeXML call flow — important gotcha
When `<Dial>` has an `action` attribute, Telnyx redirects control to that URL after the dial completes. Any verbs placed **after** `</Dial>` in the same response are never executed — they're dead code.

Voicemail fallback therefore lives in `app/api/webhooks/voice/status/route.ts`, not in the main route. The status handler checks `DialCallStatus`: if it's anything other than `completed` (e.g. `no-answer`, `busy`, `failed`), it looks up the group's `voicemail_enabled` flag and returns the `<Say>/<Record>` TeXML. The main route's `<Dial>` block contains only the `<Sip>` targets.

## Dev
```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\dialer-app"; npm run dev
```
App runs at http://localhost:3000
