-- Prescriptions written from the patient record. Reconstructed from code usage
-- (created out-of-band in Studio, no prior create-table migration).
-- `medicines` is a jsonb array of { name, dosage, frequency, duration,
-- instructions? } — the exact shape the AI prescription-suggest endpoint and
-- the manual Rx form both produce. Left untyped so the app can iterate.
-- Same email-on-dentists RLS pattern as perio_charts.

create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  dentist_id    uuid not null references public.dentists(id) on delete cascade,
  medicines     jsonb not null default '[]'::jsonb,
  instructions  text,
  template_used text,
  created_at    timestamptz not null default now()
);

create index if not exists prescriptions_patient_created_idx
  on public.prescriptions (patient_id, created_at desc);
create index if not exists prescriptions_dentist_idx on public.prescriptions (dentist_id);

alter table public.prescriptions enable row level security;

drop policy if exists "Dentists read their own prescriptions" on public.prescriptions;
create policy "Dentists read their own prescriptions"
  on public.prescriptions
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists insert their own prescriptions" on public.prescriptions;
create policy "Dentists insert their own prescriptions"
  on public.prescriptions
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists update their own prescriptions" on public.prescriptions;
create policy "Dentists update their own prescriptions"
  on public.prescriptions
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete their own prescriptions" on public.prescriptions;
create policy "Dentists delete their own prescriptions"
  on public.prescriptions
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
