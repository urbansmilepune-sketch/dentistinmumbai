-- famdent_leads — captures a row per city-button click on the /famdent QR
-- landing page (Famdent Show Mumbai, June 12–14 2026). Written by the
-- service role from src/app/api/famdent/track; no public RLS policy, so
-- booth analytics stays admin-only.

CREATE TABLE IF NOT EXISTS public.famdent_leads (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  clicked_at timestamptz default now(),
  user_agent text
);
