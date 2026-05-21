-- Multi-branch wiring: tie appointments, invoices, and staff to a specific
-- clinic_locations row so dentists with more than one branch can filter
-- schedules, attribute revenue, and scope staff. Every column is nullable
-- and unbackfilled — legacy single-branch dentists keep working with
-- location_id IS NULL meaning "the only / primary branch / all branches".
--
-- ON DELETE SET NULL on every FK so a soft cleanup of a branch (e.g. closing
-- a branch and removing the row) leaves the historical appointments and
-- invoices intact rather than cascading-deleting a year of patient records.

alter table public.appointments
  add column if not exists location_id uuid references public.clinic_locations(id) on delete set null;

create index if not exists appointments_location_idx
  on public.appointments (location_id);

alter table public.invoices
  add column if not exists location_id uuid references public.clinic_locations(id) on delete set null;

create index if not exists invoices_location_idx
  on public.invoices (location_id);

-- For clinic_staff, location_id = NULL is the "all branches" assignment,
-- so a partial index avoids a useless btree of nulls but still speeds up
-- branch-scoped staff lookups.
alter table public.clinic_staff
  add column if not exists location_id uuid references public.clinic_locations(id) on delete set null;

create index if not exists clinic_staff_location_idx
  on public.clinic_staff (location_id)
  where location_id is not null;
