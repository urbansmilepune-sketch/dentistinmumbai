-- First case for new dentists (approved 27 Nov 2026, first-case/mockup.html).
--
-- Two new columns on dentists, for the day-1 / day-5 WhatsApp nudge:
--   first_case_nudges    how many first-case nudges were sent (stops at 2)
--   first_case_nudge_at  when the last one was sent
--
-- Run by hand in the Supabase SQL editor. Safe to run more than once.
-- Everything else in this release (quick case flow, home card, cases in
-- review shown to dentists, First case badge, admin list) works without it.

alter table public.dentists add column if not exists first_case_nudges integer not null default 0;
alter table public.dentists add column if not exists first_case_nudge_at timestamptz;

-- Check: should list the two columns.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'dentists'
  and column_name in ('first_case_nudges', 'first_case_nudge_at');
