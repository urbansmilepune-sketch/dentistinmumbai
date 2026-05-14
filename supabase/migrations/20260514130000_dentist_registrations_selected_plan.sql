-- Track which Gold plan period the dentist picked on the marketing page
-- (?plan=monthly | ?plan=annual on the register URL). Nullable because the
-- column is added retroactively to a populated table and most existing rows
-- predate the toggle. CHECK constraint enforces the two valid values at the
-- DB layer in addition to the API-level whitelist.

alter table public.dentist_registrations
  add column if not exists selected_plan text;

alter table public.dentist_registrations
  drop constraint if exists dentist_registrations_selected_plan_check;

alter table public.dentist_registrations
  add constraint dentist_registrations_selected_plan_check
  check (selected_plan is null or selected_plan in ('monthly', 'annual'));
