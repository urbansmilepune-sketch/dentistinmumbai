-- Treatment plans v2 — the original treatment_plans / treatment_plan_steps
-- tables exist in production but were never captured as a migration in this
-- repo (they predate the per-feature migration discipline). The dashboard's
-- existing "Plans" tab writes:
--   treatment_plans(id, patient_id, dentist_id, title, total_cost)
--   treatment_plan_steps(id, plan_id, step_number, treatment_name,
--                        tooth_number, estimated_cost, notes)
--
-- This migration ADDS the columns the new dedicated treatment-plan page
-- needs (status + acceptance tracking, step status + completion stamps,
-- updated_at, free-form notes) without dropping or renaming any legacy
-- column. The new UI writes BOTH the legacy `tooth_number` and the new
-- `tooth_numbers` field so the old Plans tab keeps rendering.
--
-- All ALTERs are IF NOT EXISTS so re-running this migration on either a
-- fresh DB (where the tables are created by the create-table block below)
-- or the live DB (where the tables already exist) is a no-op.

-- Create the base tables idempotently for fresh environments. On production
-- these statements are no-ops because the tables already exist.
create table if not exists public.treatment_plans (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid references public.patients(id) on delete cascade,
  dentist_id      uuid references public.dentists(id) on delete cascade,
  title           text not null,
  total_cost      numeric default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.treatment_plan_steps (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid references public.treatment_plans(id) on delete cascade,
  step_number     int not null,
  treatment_name  text not null,
  tooth_number    text,
  estimated_cost  numeric default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ---- treatment_plans new columns ---------------------------------------

alter table public.treatment_plans
  add column if not exists status text default 'draft';
alter table public.treatment_plans
  add column if not exists total_estimated_cost numeric default 0;
alter table public.treatment_plans
  add column if not exists notes text;
alter table public.treatment_plans
  add column if not exists updated_at timestamptz default now();
alter table public.treatment_plans
  add column if not exists presented_at timestamptz;
alter table public.treatment_plans
  add column if not exists accepted_at timestamptz;
alter table public.treatment_plans
  add column if not exists declined_at timestamptz;

-- Backfill total_estimated_cost from the legacy total_cost on existing
-- rows. The legacy column stays as the canonical sum for old plans; the
-- new UI uses total_estimated_cost so both can coexist while the
-- transition completes.
update public.treatment_plans
   set total_estimated_cost = coalesce(total_cost, 0)
 where total_estimated_cost is null
    or total_estimated_cost = 0;

-- Constraint guard — only add the check if it doesn't already exist, so
-- re-running the migration doesn't error on duplicate constraint name.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'treatment_plans_status_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_status_check
      check (status in ('draft','presented','accepted','in_progress','completed','declined'));
  end if;
end $$;

-- Keep updated_at honest. Cheap row-scoped trigger, same pattern as
-- lab_work.updated_at.
create or replace function public.treatment_plans_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists treatment_plans_updated_at on public.treatment_plans;
create trigger treatment_plans_updated_at
  before update on public.treatment_plans
  for each row execute function public.treatment_plans_set_updated_at();

-- ---- treatment_plan_steps new columns ----------------------------------

alter table public.treatment_plan_steps
  add column if not exists status text default 'pending';
alter table public.treatment_plan_steps
  add column if not exists completed_at timestamptz;
-- The spec uses the plural form; we keep the legacy singular column for
-- backward compatibility with the old "Plans" tab. New code writes to
-- both; reads prefer tooth_numbers when present, else tooth_number.
alter table public.treatment_plan_steps
  add column if not exists tooth_numbers text;

-- Backfill the plural column from the legacy singular column so existing
-- step rows render correctly in the new UI immediately.
update public.treatment_plan_steps
   set tooth_numbers = tooth_number
 where tooth_numbers is null
   and tooth_number is not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'treatment_plan_steps_status_check'
  ) then
    alter table public.treatment_plan_steps
      add constraint treatment_plan_steps_status_check
      check (status in ('pending','scheduled','completed','skipped'));
  end if;
end $$;

-- ---- Indexes for the dashboard queries ---------------------------------

-- Patient detail page lists plans newest-first.
create index if not exists treatment_plans_patient_idx
  on public.treatment_plans (patient_id, created_at desc);
-- Dentist-wide reports filter by status.
create index if not exists treatment_plans_dentist_status_idx
  on public.treatment_plans (dentist_id, status);
-- Step list is always rendered in step_number order.
create index if not exists treatment_plan_steps_plan_idx
  on public.treatment_plan_steps (plan_id, step_number);

-- ---- RLS ---------------------------------------------------------------

alter table public.treatment_plans      enable row level security;
alter table public.treatment_plan_steps enable row level security;

drop policy if exists "Dentists manage own treatment_plans" on public.treatment_plans;
create policy "Dentists manage own treatment_plans"
  on public.treatment_plans
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- Steps inherit ownership through the parent plan.
drop policy if exists "Dentists manage own treatment_plan_steps" on public.treatment_plan_steps;
create policy "Dentists manage own treatment_plan_steps"
  on public.treatment_plan_steps
  for all
  using (
    plan_id in (
      select tp.id from public.treatment_plans tp
      join public.dentists d on d.id = tp.dentist_id
      where d.email = auth.jwt() ->> 'email'
    )
  )
  with check (
    plan_id in (
      select tp.id from public.treatment_plans tp
      join public.dentists d on d.id = tp.dentist_id
      where d.email = auth.jwt() ->> 'email'
    )
  );
