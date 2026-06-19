-- Consent-form templates. Reconstructed from code usage (created out-of-band
-- in Studio, no prior create-table migration). Distinct from consent_forms
-- (20260514150000) which stores signed forms; this holds the reusable template
-- text dentists pick from.
--
-- Two flavours of row:
--   * System templates: is_system = true, dentist_id IS NULL — shared, every
--     dentist can read them. "Editing" a system template inserts a private
--     copy (is_system = false) rather than mutating the shared row.
--   * Custom templates: is_system = false, dentist_id = the owning dentist.
-- form_type is left as free text (no check constraint): the UI offers more
-- types than consent_forms does (extraction, rct, implant, orthodontic,
-- surgery, anaesthesia, whitening, custom), and we don't want to reject any.

create table if not exists public.consent_templates (
  id           uuid primary key default gen_random_uuid(),
  dentist_id   uuid references public.dentists(id) on delete cascade,
  form_type    text not null,
  form_title   text not null,
  form_content text not null,
  is_system    boolean not null default false,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists consent_templates_dentist_idx on public.consent_templates (dentist_id);
create index if not exists consent_templates_system_idx on public.consent_templates (is_system);

alter table public.consent_templates enable row level security;

-- Read: shared system templates OR the dentist's own custom templates. The
-- listing query carries no dentist filter and leans on this policy to scope.
drop policy if exists "Dentists read system and own consent_templates" on public.consent_templates;
create policy "Dentists read system and own consent_templates"
  on public.consent_templates
  for select
  using (
    is_system = true
    or dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- Write paths only ever touch a dentist's own rows; system templates are
-- seeded out of band.
drop policy if exists "Dentists insert own consent_templates" on public.consent_templates;
create policy "Dentists insert own consent_templates"
  on public.consent_templates
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists update own consent_templates" on public.consent_templates;
create policy "Dentists update own consent_templates"
  on public.consent_templates
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete own consent_templates" on public.consent_templates;
create policy "Dentists delete own consent_templates"
  on public.consent_templates
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
