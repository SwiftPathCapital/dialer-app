-- Run this in your Supabase SQL editor

-- Agents table (individual softphones)
create table if not exists agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique not null,
  sip_username text unique,        -- Telnyx SIP credential username
  sip_password text,               -- Telnyx SIP credential password
  sip_connection_id text,          -- Telnyx credential connection ID (used to build SIP URI: username@<id>.sip.telnyx.com)
  extension   text,
  status      text check (status in ('available', 'busy', 'offline')) default 'offline',
  updated_at  timestamptz default now()
);

-- Inbound routing groups
create table if not exists inbound_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  phone_number     text unique,    -- Telnyx DID assigned to this group
  voicemail_enabled boolean default true,
  created_at       timestamptz default now()
);

-- Group membership
create table if not exists inbound_group_members (
  group_id  uuid references inbound_groups(id) on delete cascade,
  agent_id  uuid references agents(id) on delete cascade,
  primary key (group_id, agent_id)
);

-- Call log (dialer_calls avoids conflict with the CRM's calls table)
create table if not exists dialer_calls (
  id                       uuid primary key default gen_random_uuid(),
  direction                text check (direction in ('inbound', 'outbound')),
  from_number              text,
  to_number                text,
  agent_id                 uuid references agents(id),
  group_id                 uuid references inbound_groups(id),
  status                   text,
  duration_seconds         int,
  telnyx_call_control_id   text,
  started_at               timestamptz default now(),
  ended_at                 timestamptz
);

-- Voicemails
create table if not exists voicemails (
  id            uuid primary key default gen_random_uuid(),
  call_id       uuid references calls(id),
  group_id      uuid references inbound_groups(id),
  from_number   text,
  recording_url text,
  transcription text,
  listened      boolean default false,
  created_at    timestamptz default now()
);

-- SMS conversations (one per contact + our_number pair)
create table if not exists sms_conversations (
  id              uuid primary key default gen_random_uuid(),
  contact_number  text not null,
  our_number      text not null,
  group_id        uuid references inbound_groups(id),
  last_message_at timestamptz,
  unique(contact_number, our_number)
);

-- Individual SMS messages
create table if not exists sms_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid references sms_conversations(id) on delete cascade,
  direction           text check (direction in ('inbound', 'outbound')),
  body                text,
  telnyx_message_id   text,
  sent_at             timestamptz default now()
);

-- App configuration (Telnyx keys, app URL — managed via /admin/config)
create table if not exists app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

-- Enable Realtime for live updates
alter publication supabase_realtime add table sms_messages;
alter publication supabase_realtime add table sms_conversations;
alter publication supabase_realtime add table voicemails;
alter publication supabase_realtime add table dialer_calls;
alter publication supabase_realtime add table agents;
