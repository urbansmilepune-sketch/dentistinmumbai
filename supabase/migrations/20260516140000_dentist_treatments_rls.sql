-- dentist_treatments was created out-of-band in Studio without consistent
-- write policies. SELECTs work (the public profile and dashboard overview
-- both read it), but INSERT / UPDATE / DELETE from the dashboard's
-- Treatments page are rejected by RLS — so dentists couldn't add treatments
-- or set fee ranges.
--
-- This migration enables RLS (no-op if already on) and ensures all four
-- CRUD policies match the email-mapped-to-dentists.id pattern used by every
-- other dentist-scoped table in the project. `drop policy if exists` lets
-- this run cleanly whether or not partial policies already exist.

alter table public.dentist_treatments enable row level security;

-- Public SELECT — the patient-facing profile, listing, area, and treatment
-- pages all read this through the anon client. Keep that working.
drop policy if exists "Public reads dentist_treatments" on public.dentist_treatments;
create policy "Public reads dentist_treatments"
  on public.dentist_treatments
  for select
  using (true);

-- INSERT — the dentist whose JWT email maps to dentists.email can attach
-- treatments to their own row, nothing else.
drop policy if exists "Dentists add own dentist_treatments" on public.dentist_treatments;
create policy "Dentists add own dentist_treatments"
  on public.dentist_treatments
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- UPDATE — same scope. with check + using both required so the dentist
-- can't move a row to a different dentist_id during update.
drop policy if exists "Dentists update own dentist_treatments" on public.dentist_treatments;
create policy "Dentists update own dentist_treatments"
  on public.dentist_treatments
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- DELETE — same scope.
drop policy if exists "Dentists delete own dentist_treatments" on public.dentist_treatments;
create policy "Dentists delete own dentist_treatments"
  on public.dentist_treatments
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
