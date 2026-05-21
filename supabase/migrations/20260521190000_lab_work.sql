-- Dental lab work tracker. One row per case (crown, bridge, denture,
-- aligner set, etc.) sent out to an external lab. Tracks the round-trip
-- from "sent" through "delivered" so the front desk can flag overdue
-- cases and notify patients when their work is ready for fitting.
--
-- The status check constraint matches what /dashboard/lab-work renders
-- as the transition pipeline: sent → in_progress → ready → delivered.
-- A remake bucket exists for cases the lab has to redo (wrong shade,
-- ill-fitting margin, etc.) — those flow back to in_progress next time.
--
-- patient_id is nullable on the FK so closing a patient record (rare,
-- usually a duplicate cleanup) doesn't cascade-delete years of lab
-- history. dentist_id is required.

create table if not exists public.lab_work (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid references public.patients(id) on delete set null,
  dentist_id           uuid not null references public.dentists(id) on delete cascade,
  lab_name             text,
  lab_phone            text,
  work_type            text not null,
  tooth_numbers        text,
  shade                text,
  sent_date            date,
  expected_return_date date,
  actual_return_date   date,
  status               text not null default 'sent',
  cost                 numeric,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lab_work_status_check
    check (status in ('sent', 'in_progress', 'ready', 'delivered', 'remake'))
);

-- The patient detail page lists per-patient cases newest-first; the
-- dashboard list view filters by status + dentist. Both queries are
-- served by these two indexes.
create index if not exists lab_work_patient_idx
  on public.lab_work (patient_id, created_at desc);
create index if not exists lab_work_dentist_status_idx
  on public.lab_work (dentist_id, status, expected_return_date);

-- Keep updated_at honest so the dashboard can sort "recently touched"
-- without a separate trigger column. Cheap row-scoped trigger.
create or replace function public.lab_work_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lab_work_updated_at on public.lab_work;
create trigger lab_work_updated_at
  before update on public.lab_work
  for each row execute function public.lab_work_set_updated_at();

-- RLS: same email-on-dentists pattern as consent_forms / perio_charts /
-- patient_images. Single combined policy because there's no asymmetry
-- between read and write here — a dentist either owns a row or doesn't.
alter table public.lab_work enable row level security;

drop policy if exists "Dentists manage own lab_work" on public.lab_work;
create policy "Dentists manage own lab_work"
  on public.lab_work
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
