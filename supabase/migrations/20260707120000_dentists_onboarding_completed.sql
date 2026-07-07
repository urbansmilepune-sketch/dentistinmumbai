-- dentists.onboarding_completed — gates the first-run onboarding wizard at
-- /for-dentists/onboard. The dashboard layout redirects owners with a bare
-- profile here until they finish the wizard or explicitly skip (both set this
-- flag true).
--
-- NOTE: applied out-of-band in the Supabase SQL editor — the CLI isn't linked
-- in this project (no DB password), so `db push` can't run. This file is the
-- reconstructed record of the change that was applied by hand.
alter table public.dentists
  add column if not exists onboarding_completed boolean not null default false;

-- Existing dentists predate the wizard — don't trap them in it. Mark every
-- current row done so only NEW sign-ups (which get the default false) are
-- routed through onboarding. One-time backfill; safe to re-run (idempotent).
update public.dentists set onboarding_completed = true where onboarding_completed = false;
