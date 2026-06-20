-- Custom consent templates: let dentists author/soft-delete their own
-- templates alongside the seeded system ones (see 20260618130100). Adds an
-- is_active flag (delete in the UI is a soft delete → is_active = false) and a
-- single FOR ALL policy that lets a dentist read the shared system templates
-- plus read/write their own rows.
--
-- Faithful reconstruction of the statement run in the Supabase SQL editor (CLI
-- not linked to this project — migrations here are replayable no-ops kept for
-- record; see project memory). The new "dentist_own_consent_templates" policy
-- is additive: the existing per-command read/insert/update/delete policies
-- from 20260618130100 remain (multiple permissive policies are OR'd).

alter table public.consent_templates
  add column if not exists is_active boolean default true;

drop policy if exists "dentist_own_consent_templates" on public.consent_templates;
create policy "dentist_own_consent_templates"
  on public.consent_templates
  for all
  using (
    is_system = true
    or dentist_id = (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id = (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
