-- Inventory stock-movement ledger (one row per restock or use). Reconstructed
-- from code usage (created out-of-band in Studio, no prior create-table
-- migration). Depends on inventory_items (20260618130600) — that migration
-- must run first so the item_id FK resolves. type is 'restock' or 'use';
-- quantity is numeric to mirror inventory_items stock.

create table if not exists public.inventory_movements (
  id         uuid primary key default gen_random_uuid(),
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  item_id    uuid not null references public.inventory_items(id) on delete cascade,
  type       text not null,
  quantity   numeric not null,
  notes      text,
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_check check (type in ('restock', 'use'))
);

create index if not exists inventory_movements_item_created_idx
  on public.inventory_movements (item_id, created_at desc);
create index if not exists inventory_movements_dentist_idx
  on public.inventory_movements (dentist_id);

alter table public.inventory_movements enable row level security;

drop policy if exists "Dentists read their own inventory_movements" on public.inventory_movements;
create policy "Dentists read their own inventory_movements"
  on public.inventory_movements
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists insert their own inventory_movements" on public.inventory_movements;
create policy "Dentists insert their own inventory_movements"
  on public.inventory_movements
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete their own inventory_movements" on public.inventory_movements;
create policy "Dentists delete their own inventory_movements"
  on public.inventory_movements
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
