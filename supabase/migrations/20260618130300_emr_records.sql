-- Electronic medical records — the full clinical-visit record created from the
-- EMR "New record" form. Reconstructed from code usage (created out-of-band in
-- Studio, no prior create-table migration). Distinct from emr_templates
-- (20260517120000), which holds the reusable form scaffolds.
--
-- The structured clinical fields are jsonb so the form can evolve without a
-- migration each time (matching the perio_charts/measurements approach):
--   chief_complaints jsonb  -> array of complaint strings
--   vitals           jsonb  -> { bp, pulse, spo2, weight_kg, height_cm }
--   medications      jsonb  -> array of { name, dosage, frequency, duration }
--   procedures       jsonb  -> array of { name, tooth_number, price }
-- Same email-on-dentists RLS pattern as perio_charts.

create table if not exists public.emr_records (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients(id) on delete cascade,
  dentist_id       uuid not null references public.dentists(id) on delete cascade,
  template_used    text,
  chief_complaints jsonb not null default '[]'::jsonb,
  vitals           jsonb not null default '{}'::jsonb,
  diagnosis        text,
  medications      jsonb not null default '[]'::jsonb,
  procedures       jsonb not null default '[]'::jsonb,
  advice           text,
  follow_up_date   date,
  follow_up_notes  text,
  created_at       timestamptz not null default now()
);

create index if not exists emr_records_patient_created_idx
  on public.emr_records (patient_id, created_at desc);
create index if not exists emr_records_dentist_idx on public.emr_records (dentist_id);

alter table public.emr_records enable row level security;

drop policy if exists "Dentists read their own emr_records" on public.emr_records;
create policy "Dentists read their own emr_records"
  on public.emr_records
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists insert their own emr_records" on public.emr_records;
create policy "Dentists insert their own emr_records"
  on public.emr_records
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists update their own emr_records" on public.emr_records;
create policy "Dentists update their own emr_records"
  on public.emr_records
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete their own emr_records" on public.emr_records;
create policy "Dentists delete their own emr_records"
  on public.emr_records
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
