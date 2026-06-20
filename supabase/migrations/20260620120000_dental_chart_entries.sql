-- Per-condition dental chart entries — backs the photorealistic 32-tooth
-- ToothChart component on the patient detail page (the "Tooth Chart" sub-tab
-- under Dental Chart). One row per (patient, tooth, condition); the UI records
-- a single condition per tooth but the schema allows multiple so a tooth can
-- legitimately carry e.g. both a crown and recession in future.
--
-- This file is a faithful reconstruction of the statement run in the Supabase
-- SQL editor (the CLI is not linked to this project, so migrations here are
-- replayable no-ops for record-keeping — see project memory). The only change
-- from the pasted SQL is the RLS policy: Postgres 15 rejects
-- `CREATE POLICY IF NOT EXISTS`, so we use the repo's idempotent
-- drop-then-create pattern (same as bug_reports, lab_work, patient_images)
-- and add an explicit WITH CHECK so inserts are scoped to the dentist too.
--
-- Replaces the legacy single-row JSONB `dental_charts` table for the tooth
-- chart; existing dental_charts data is not migrated.

create table if not exists public.dental_chart_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  tooth_number integer not null check (
    tooth_number in (
      11,12,13,14,15,16,17,18,
      21,22,23,24,25,26,27,28,
      31,32,33,34,35,36,37,38,
      41,42,43,44,45,46,47,48
    )
  ),
  condition text not null check (condition in (
    'healthy','caries','rct','crown','missing','implant',
    'bridge_abutment','bridge_pontic','fracture','sensitivity',
    'abscess','impacted','partially_erupted','wear_attrition',
    'erosion','fluorosis','hypoplasia','mobility','recession'
  )),
  surfaces text[] default '{}',
  notes text,
  severity text check (severity in ('mild','moderate','severe')),
  recorded_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists dental_chart_patient_tooth_unique
  on public.dental_chart_entries (patient_id, tooth_number, condition);

alter table public.dental_chart_entries enable row level security;

drop policy if exists "dentist_own_chart_entries" on public.dental_chart_entries;
create policy "dentist_own_chart_entries"
  on public.dental_chart_entries
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
