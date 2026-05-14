-- custom_medicines: per-dentist list of medications the dentist has typed
-- into the EMR form but that weren't in the built-in suggestion list. The EMR
-- save flow upserts new rows here so they appear in this dentist's future
-- medication autocomplete suggestions. Scoped per dentist on purpose — names
-- are not shared across the platform.

create table if not exists public.custom_medicines (
  id          uuid primary key default gen_random_uuid(),
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (dentist_id, name)
);

create index if not exists custom_medicines_dentist_idx
  on public.custom_medicines (dentist_id);

-- RLS: only let a dentist see / write their own rows. The pattern matches
-- other tables in this project that key dentist ownership via email on the
-- dentists table rather than auth.uid().
alter table public.custom_medicines enable row level security;

create policy "Dentists read their own custom medicines"
  on public.custom_medicines
  for select
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

create policy "Dentists insert their own custom medicines"
  on public.custom_medicines
  for insert
  with check (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );
