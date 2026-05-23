-- Documentation-only migration: these ALTERs were applied manually
-- against the live Supabase instance on 2026-05-23. This file exists
-- so the repo migration history matches production schema.

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS ip text;

ALTER TABLE dentists
  ADD COLUMN IF NOT EXISTS rank_score numeric NOT NULL DEFAULT 0;
