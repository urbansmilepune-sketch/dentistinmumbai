-- Carry the dentist's chosen Gold period from registration through to their
-- live dentists row, so the upgrade page can default the Monthly/Annual toggle
-- to the option they originally picked. Same shape as the registrations one.

alter table public.dentists
  add column if not exists selected_plan text;

alter table public.dentists
  drop constraint if exists dentists_selected_plan_check;

alter table public.dentists
  add constraint dentists_selected_plan_check
  check (selected_plan is null or selected_plan in ('monthly', 'annual'));
