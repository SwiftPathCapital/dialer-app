-- ============================================================
-- SwiftPath Dialer — database schema
-- Run this ONCE in the Supabase SQL Editor.
-- The `agents` table already exists (shared with the CRM).
-- This script only ADDS dialer-specific columns and creates
-- the dialer-only tables. It is safe to re-run.
-- ============================================================

-- ── Extend the shared agents table with dialer columns ────────────────────────
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sip_connection_id    text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS extension            text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status               text
  CHECK (status IN ('available', 'busy', 'offline')) DEFAULT 'offline';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();
ALTER TABLE agents ADD COLUMN IF NOT EXISTS voicemail_greeting_url text;

-- ── Inbound routing groups ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbound_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  phone_number     text UNIQUE,
  voicemail_enabled boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- ── Group membership ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbound_group_members (
  group_id  uuid REFERENCES inbound_groups(id) ON DELETE CASCADE,
  agent_id  uuid REFERENCES agents(id)         ON DELETE CASCADE,
  PRIMARY KEY (group_id, agent_id)
);

-- ── Call log (separate from CRM's `calls` table) ─────────────────────────────
CREATE TABLE IF NOT EXISTS dialer_calls (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction              text CHECK (direction IN ('inbound', 'outbound')),
  from_number            text,
  to_number              text,
  agent_id               uuid REFERENCES agents(id),
  group_id               uuid REFERENCES inbound_groups(id),
  status                 text,
  duration_seconds       int,
  telnyx_call_control_id text,
  started_at             timestamptz DEFAULT now(),
  ended_at               timestamptz
);

-- ── Voicemails ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voicemails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       uuid REFERENCES dialer_calls(id),
  group_id      uuid REFERENCES inbound_groups(id),
  from_number   text,
  recording_url text,
  transcription text,
  listened      boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

-- ── SMS conversations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_number  text NOT NULL,
  our_number      text NOT NULL,
  group_id        uuid REFERENCES inbound_groups(id),
  last_message_at timestamptz,
  UNIQUE(contact_number, our_number)
);

-- ── SMS messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid REFERENCES sms_conversations(id) ON DELETE CASCADE,
  direction         text CHECK (direction IN ('inbound', 'outbound')),
  body              text,
  telnyx_message_id text,
  sent_at           timestamptz DEFAULT now()
);

-- ── App config (Telnyx keys, managed via /admin/config) ──────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO app_config (key, value) VALUES
  ('telnyx_api_key',           null),
  ('telnyx_public_key',        null),
  ('telnyx_sip_connection_id', null),
  ('app_url',                  null)
ON CONFLICT (key) DO NOTHING;

-- ── Realtime ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE voicemails;
ALTER PUBLICATION supabase_realtime ADD TABLE dialer_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
