-- Periodontal charts. One row per charting session — we deliberately do NOT
-- update an existing row when re-charting, so that a six-month follow-up
-- visit produces a new row and the UI can diff against the prior chart.
-- The /Charts/Perio sub-tab queries `order by created_at desc limit 2` and
-- compares the two rows.
--
-- measurements is keyed by FDI tooth number (string), each value a small
-- object holding 3-element pocket-depth + bleeding-on-probing + recession
-- arrays and the mobility / furcation scalars. See PerioChart.tsx for the
-- exact shape; we leave the JSONB untyped here so the app can iterate on
-- the schema without a follow-up migration.

create table if not exists public.perio_charts (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  chart_date  date not null default current_date,
  measurements jsonb not null default '{}'::jsonb,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Most reads are "all charts for one patient, newest first" — the
-- (patient_id, created_at desc) combo serves both filtering and ordering.
create index if not exists perio_charts_patient_created_idx
  on public.perio_charts (patient_id, created_at desc);
create index if not exists perio_charts_dentist_idx
  on public.perio_charts (dentist_id);

-- RLS: same email-on-dentists pattern as consent_forms / visits / etc.
-- Insert + select gates live on dentist_id so a denied write returns the
-- usual zero-rows-no-error shape the dashboard already knows how to read.
alter table public.perio_charts enable row level security;

drop policy if exists "Dentists read their own perio_charts" on public.perio_charts;
create policy "Dentists read their own perio_charts"
  on public.perio_charts
  for select
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

drop policy if exists "Dentists insert their own perio_charts" on public.perio_charts;
create policy "Dentists insert their own perio_charts"
  on public.perio_charts
  for insert
  with check (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

drop policy if exists "Dentists update their own perio_charts" on public.perio_charts;
create policy "Dentists update their own perio_charts"
  on public.perio_charts
  for update
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  )
  with check (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

drop policy if exists "Dentists delete their own perio_charts" on public.perio_charts;
create policy "Dentists delete their own perio_charts"
  on public.perio_charts
  for delete
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );
