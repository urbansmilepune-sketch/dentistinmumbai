-- Capture the referral code from ?ref=<code> on the registration link.
--
-- Previously the registration page read ?email= and ?plan= but silently
-- dropped ?ref=, so the referrer was never persisted anywhere. Two new
-- columns store it:
--
--   * dentist_registrations.ref_code — the audit-trail record of who
--     referred each signup. NOTE: this is distinct from the existing
--     `ref_no` column (e.g. DIM-DR-7V9UZ), which is the dentist's OWN
--     auto-generated code, not the referrer.
--   * dentists.ref — the same value mirrored onto the live dentist row
--     so referral attribution survives even if the audit row is ever
--     pruned.
--
-- Nullable + no backfill: existing rows predate ref capture, so NULL is
-- correct for them. The earliest captured referral (?ref=NIKITA) cannot
-- be backfilled because the value was never stored.
--
-- Schema here is managed out-of-band (the CLI isn't linked); apply this
-- in the Supabase SQL editor. The API (src/app/api/registrations/route.ts)
-- degrades gracefully and skips these columns until the migration runs.

alter table public.dentist_registrations
  add column if not exists ref_code text;

alter table public.dentists
  add column if not exists ref text;
