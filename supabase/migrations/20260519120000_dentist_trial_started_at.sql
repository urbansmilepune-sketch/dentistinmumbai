-- Every approved dentist gets a 30-day free trial that unlocks Gold-level
-- features. The trial clock is the wall time from when this column is set
-- (currently: on approval — see src/lib/approval.ts) to +30 days. Once it
-- elapses, callers fall back to the dentist's real tier in `dentists.tier`,
-- which is `free` unless they've purchased an upgrade.
--
-- Existing approved dentists left at NULL — they don't retroactively get a
-- trial. If we want to grandfather them in later, run a one-off UPDATE
-- setting trial_started_at = approved_at (or now()) for the cohort we pick.
alter table public.dentists
  add column if not exists trial_started_at timestamptz;
