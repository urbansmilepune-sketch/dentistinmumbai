-- 2026-10-30: wrong-guess lockout for 6-digit login codes.
-- Run by hand in the Supabase SQL Editor (the CLI is not linked).
-- Safe to run more than once. The app works before this runs (it falls back
-- to an in-memory counter), but the lockout only survives restarts after it.

alter table public.email_otps
  add column if not exists failed_attempts integer not null default 0;

alter table public.patient_portal_otps
  add column if not exists failed_attempts integer not null default 0;

-- Check: both rows should come back.
select table_name, column_name, data_type, column_default
from information_schema.columns
where column_name = 'failed_attempts'
  and table_name in ('email_otps', 'patient_portal_otps');
