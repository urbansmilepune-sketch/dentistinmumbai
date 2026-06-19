-- Treatments lookup table. Reconstructed from code usage — this table was
-- created out-of-band in Supabase Studio and never had a create-table
-- migration, so a from-scratch rebuild was missing it. `create table if not
-- exists` makes this a no-op against the live DB while letting a fresh
-- database stand the table up.
--
-- This is a global, public, read-only lookup (NOT dentist-scoped): the public
-- /treatment/[slug] pages and the dentist dashboard both read it, and
-- dentist_treatments.treatment_id points here. The landing page reads it via
-- `select('*')`, so production may carry extra content columns not referenced
-- in code; only the code-referenced columns are reconstructed below.

create table if not exists public.treatments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  icon       text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists treatments_sort_order_idx on public.treatments (sort_order);

-- Public, read-only: anyone (anon included) can read the catalogue. Writes are
-- managed out of band (Studio / service-role), so there are no write policies.
-- Mirrors the "Public reads dentist_treatments" approach.
alter table public.treatments enable row level security;

drop policy if exists "Public reads treatments" on public.treatments;
create policy "Public reads treatments"
  on public.treatments
  for select
  using (true);
