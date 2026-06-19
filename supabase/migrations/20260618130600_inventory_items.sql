-- Clinic inventory items. Reconstructed from code usage (created out-of-band
-- in Studio, no prior create-table migration). Only inventory_reorders was
-- ever touched by a migration (dentalsamaan_integration); the items and
-- movements tables themselves were missing.
--
-- Stock quantities are numeric (not integer) because units like ml/g can be
-- fractional. category is free text validated in the API to one of:
-- consumables, instruments, medicines, ppe, lab_materials. The API mutates
-- this table via the service-role key; RLS below is defence-in-depth and
-- parity with the rest of the dentist-scoped schema.

create table if not exists public.inventory_items (
  id              uuid primary key default gen_random_uuid(),
  dentist_id      uuid not null references public.dentists(id) on delete cascade,
  name            text not null,
  category        text not null,
  current_stock   numeric not null default 0,
  min_stock_level numeric not null default 0,
  unit            text not null,
  expiry_date     date,
  supplier_name   text,
  supplier_phone  text,
  unit_cost       numeric,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists inventory_items_dentist_idx on public.inventory_items (dentist_id);
create index if not exists inventory_items_expiry_idx on public.inventory_items (expiry_date);

alter table public.inventory_items enable row level security;

drop policy if exists "Dentists read their own inventory_items" on public.inventory_items;
create policy "Dentists read their own inventory_items"
  on public.inventory_items
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists insert their own inventory_items" on public.inventory_items;
create policy "Dentists insert their own inventory_items"
  on public.inventory_items
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists update their own inventory_items" on public.inventory_items;
create policy "Dentists update their own inventory_items"
  on public.inventory_items
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete their own inventory_items" on public.inventory_items;
create policy "Dentists delete their own inventory_items"
  on public.inventory_items
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
