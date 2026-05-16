-- The dentists table had SELECT policies (public + dentist-own) but no UPDATE
-- policy, so every Save from the dashboard was silently filtered out by RLS:
-- PATCH /rest/v1/dentists returned 200 with `[]` (zero rows affected) and the
-- UI displayed "Saved!" while the database was unchanged. Reproduced live
-- against prod on 2026-05-16 with an authenticated dentist JWT.
--
-- This adds the missing UPDATE policy using the same email-mapped pattern
-- as every other dentist-scoped table in the project. WITH CHECK matches
-- USING so a dentist can't change their email column to escape ownership.
--
-- `drop policy if exists` lets this run cleanly whether or not a partial
-- policy already exists.
--
-- This is the dentists table itself, not dentist_treatments / locations /
-- staff / etc. Dashboard pages calling .update() on dentists: profile, hours,
-- (and the legacy /for-dentists/profile route).

alter table public.dentists enable row level security;

drop policy if exists "Dentists update own dentists row" on public.dentists;
create policy "Dentists update own dentists row"
  on public.dentists
  for update
  using (
    email = auth.jwt() ->> 'email'
  )
  with check (
    email = auth.jwt() ->> 'email'
  );
