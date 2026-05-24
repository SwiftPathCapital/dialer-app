-- Run this in your Supabase SQL editor (one-time setup)
create table if not exists app_config (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

-- Seed default keys (values left empty for admin to fill in via the UI)
insert into app_config (key, value) values
  ('telnyx_api_key',          null),
  ('telnyx_public_key',       null),
  ('telnyx_sip_connection_id',null),
  ('app_url',                 null)
on conflict (key) do nothing;
