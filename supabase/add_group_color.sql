-- Run this once in the Supabase SQL editor
ALTER TABLE inbound_groups ADD COLUMN IF NOT EXISTS color text;
