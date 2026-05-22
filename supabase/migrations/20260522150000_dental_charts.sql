-- Dental charts — one row per patient holding the current state of every
-- tooth on a single canvas (caries, RCT, crown, missing, implant, etc.).
-- This is the V2 chart that backs the new /dental-chart route and the
-- ToothChart component (src/components/dental/ToothChart.tsx).
--
-- The legacy DentalChart component (rendered inside the "chart" sub-tab)
-- predates this migration and writes to `chart_data` on the same table.
-- We keep BOTH columns so the older flow keeps reading/writing its rows
-- without churn:
--   chart_data : legacy column owned by src/components/DentalChart.tsx
--   tooth_data : new column owned by src/components/dental/ToothChart.tsx
--
-- All ALTERs are IF NOT EXISTS so this migration is safe to apply against
-- a fresh DB (where the table is created here) or production (where the
-- table already exists from before per-feature migration discipline).

create table if not exists public.dental_charts (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references public.patients(id) on delete cascade,
  dentist_id  uuid references public.dentists(id) on delete cascade,
  chart_data  jsonb not null default '{}'::jsonb,
  tooth_data  jsonb not null default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Add the new column on production where the table already exists.
alter table public.dental_charts
  add column if not exists tooth_data jsonb not null default '{}'::jsonb;
alter table public.dental_charts
  add column if not exists updated_at timestamptz default now();

-- Only one chart row per (patient, dentist) — both components UPSERT.
-- Without this constraint repeated saves would create duplicate rows and
-- the .single() reads would fail with PGRST116 "multiple rows returned".
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'dental_charts_patient_dentist_key'
  ) then
    alter table public.dental_charts
      add constraint dental_charts_patient_dentist_key
      unique (patient_id, dentist_id);
  end if;
end $$;

-- updated_at trigger so the ToothChart can show "last updated".
create or replace function public.dental_charts_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists dental_charts_updated_at on public.dental_charts;
create trigger dental_charts_updated_at
  before update on public.dental_charts
  for each row execute function public.dental_charts_set_updated_at();

-- Reads always filter by patient_id; the dentist scope is enforced by RLS.
create index if not exists dental_charts_patient_idx
  on public.dental_charts (patient_id);
create index if not exists dental_charts_dentist_idx
  on public.dental_charts (dentist_id);

-- ---- RLS ---------------------------------------------------------------

alter table public.dental_charts enable row level security;

drop policy if exists "Dentists manage own dental_charts" on public.dental_charts;
create policy "Dentists manage own dental_charts"
  on public.dental_charts
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
