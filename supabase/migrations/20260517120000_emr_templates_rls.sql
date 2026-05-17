-- emr_templates owner-write RLS.
--
-- Dashboard at /for-dentists/dashboard/emr-templates lets a dentist create
-- and edit their reusable EMR templates (procedures + medications inside
-- sections_json, plus advice and a used_count counter). The page calls
-- supabase from the browser with the dentist's JWT, so RLS is the only
-- thing standing between dentist A and dentist B's templates.
--
-- The policy mirrors the pattern used by clinic_locations and clinic_staff:
-- the JWT's email column on dentists determines which dentist_ids the
-- caller can read/write. WITH CHECK matches USING so a dentist can't
-- reassign a row to another dentist mid-update.
--
-- `drop policy if exists` makes this idempotent — safe to apply even if
-- equivalent policies already exist on prod from an earlier ad-hoc apply.

alter table public.emr_templates enable row level security;

drop policy if exists "Dentists manage own emr_templates" on public.emr_templates;
create policy "Dentists manage own emr_templates"
  on public.emr_templates
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
