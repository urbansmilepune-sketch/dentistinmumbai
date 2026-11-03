-- patient_intakes — the clinic-tablet check-in.
--
-- Reception hands the clinic tablet (signed in to the dashboard) to the
-- patient, who fills a short tap form: who they are, what brings them in,
-- allergies and conditions. Name/phone/allergies go straight onto the
-- patients row; this table holds the visit-specific part (the complaint) and
-- drives the dentist's "Waiting now" list until the visit is saved.
--
-- complaint jsonb shape (written by src/app/for-dentists/dashboard/tablet):
--   { concerns: string[], area: string|null, since: string|null,
--     triggers: string[], lang: 'en'|'hi'|'mr' }
--
-- RLS: the clinic owner (email match, same pattern as visits) and active
-- clinic staff (reception usually holds the tablet) via
-- dentist_id_for_active_staff() from 20260527130000.
--
-- Apply in the Supabase SQL editor (the CLI is not linked to this project).

create table if not exists public.patient_intakes (
  id          uuid primary key default gen_random_uuid(),
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  patient_id  uuid references public.patients(id) on delete cascade,
  complaint   jsonb not null default '{}'::jsonb,
  status      text not null default 'waiting',
  visit_id    uuid references public.visits(id) on delete set null,
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint patient_intakes_status_check
    check (status in ('waiting', 'seen', 'cancelled'))
);

create index if not exists patient_intakes_dentist_created_idx
  on public.patient_intakes (dentist_id, created_at desc);
create index if not exists patient_intakes_patient_idx
  on public.patient_intakes (patient_id, created_at desc);

alter table public.patient_intakes enable row level security;

drop policy if exists "Dentists manage own patient_intakes" on public.patient_intakes;
create policy "Dentists manage own patient_intakes"
  on public.patient_intakes
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Staff manages clinic data" on public.patient_intakes;
create policy "Staff manages clinic data"
  on public.patient_intakes
  for all
  to authenticated
  using (dentist_id = public.dentist_id_for_active_staff())
  with check (dentist_id = public.dentist_id_for_active_staff());
