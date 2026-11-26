-- Invite a colleague (dentistinindia.in growth work, 26 Nov 2026).
--
-- Every dentist gets a short personal invite code. Their invite link is
-- https://dentistinindia.in/invite/<CODE>. When a colleague joins through
-- it, the new dentist's `ref` column holds that code, so
--   joined = count of dentists where ref = my invite_code.
-- "Invites sent" is counted from analytics_events (event_type 'invite_share').
--
-- Run by hand in the Supabase SQL editor. Safe to run more than once.
-- The app keeps working before this runs: the invite box just stays hidden.

-- Who referred each dentist (from the June 2026 referral migration; repeated
-- here in case that one was never run).
alter table public.dentists add column if not exists ref text;
alter table public.dentist_registrations add column if not exists ref_code text;

-- Each dentist's own code.
alter table public.dentists add column if not exists invite_code text;

-- Give every existing dentist a 7-character code (A-F, 0-9).
update public.dentists
set invite_code = upper(substr(md5(random()::text || id::text), 1, 7))
where invite_code is null;

create unique index if not exists dentists_invite_code_key
  on public.dentists (invite_code) where invite_code is not null;

-- Fast "who joined with my link" lookups.
create index if not exists dentists_ref_idx
  on public.dentists (ref) where ref is not null;

-- Check: every dentist should now have a code.
select count(*) as dentists, count(invite_code) as with_invite_code from public.dentists;
