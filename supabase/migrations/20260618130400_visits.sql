-- Visit / treatment-note history shown on the patient record. Reconstructed
-- from code usage (created out-of-band in Studio, no prior create-table
-- migration). The refine-notes AI endpoint polishes the free-text fields
-- before they're saved here. materials_used is a text[] (the form splits a
-- comma-separated input into an array). Same email-on-dentists RLS pattern as
-- perio_charts; the migrations already reference `visits` in comments.

create table if not exists public.visits (
  id                           uuid primary key default gen_random_uuid(),
  patient_id                   uuid not null references public.patients(id) on delete cascade,
  dentist_id                   uuid not null references public.dentists(id) on delete cascade,
  visit_date                   date not null default current_date,
  chief_complaint              text,
  clinical_findings            text,
  treatment_done               text,
  materials_used               text[] not null default '{}',
  next_appointment_recommended date,
  next_appointment_notes       text,
  created_at                   timestamptz not null default now()
);

create index if not exists visits_patient_date_idx
  on public.visits (patient_id, visit_date desc);
create index if not exists visits_dentist_idx on public.visits (dentist_id);

alter table public.visits enable row level security;

drop policy if exists "Dentists read their own visits" on public.visits;
create policy "Dentists read their own visits"
  on public.visits
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists insert their own visits" on public.visits;
create policy "Dentists insert their own visits"
  on public.visits
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists update their own visits" on public.visits;
create policy "Dentists update their own visits"
  on public.visits
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete their own visits" on public.visits;
create policy "Dentists delete their own visits"
  on public.visits
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
