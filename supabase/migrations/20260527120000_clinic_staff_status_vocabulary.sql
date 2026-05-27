-- clinic_staff.status vocabulary alignment.
--
-- The original locations_and_staff migration used (invited, active, removed).
-- Production was migrated by hand to (pending, active, inactive) — this
-- migration brings dev/CI in line so the schema definition lives in source
-- alongside the code that now relies on it.
--
-- Idempotent: re-running on a DB that's already on the new vocabulary is a
-- no-op (the data updates match zero rows, and the constraint is dropped/
-- re-added by the same name).

update public.clinic_staff set status = 'pending'  where status = 'invited';
update public.clinic_staff set status = 'inactive' where status = 'removed';

alter table public.clinic_staff
  drop constraint if exists clinic_staff_status_check;

alter table public.clinic_staff
  add constraint clinic_staff_status_check
    check (status in ('pending', 'active', 'inactive'));
