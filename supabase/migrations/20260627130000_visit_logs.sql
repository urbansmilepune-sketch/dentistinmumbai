-- visit_logs — field-visit log for internal outreach employees.
--
-- A row per visit an employee (identified by their referral code, e.g.
-- NIKITA) makes to a dentist or prospect. Distinct from public.visits,
-- which records CLINICAL patient visits inside a clinic — this table is a
-- sales/outreach audit trail, not patient data and carries no PHI.
--
-- Production threw "could not find table public.visit_logs in the schema
-- cache" because the table was never created (the writer lives outside this
-- repo at time of writing). This migration is the create-table of record.
--
-- Column notes:
--   * dentist_id is NULLABLE with ON DELETE SET NULL — an employee may log a
--     visit to a prospect who isn't in public.dentists yet, and removing a
--     dentist must not erase the visit audit trail.
--   * employee_ref is the referral code of the visiting employee (e.g.
--     'NIKITA') — the same code space as dentists.ref / dentist_registrations.ref_code.
--   * outcome is free text but constrained to the known vocabulary.
--
-- RLS: enabled, with NO anon/authenticated policy — this is an internal tool
-- with no dentist auth context, written by the service role from a backend
-- route (same lockdown intent as famdent_leads). The service role bypasses
-- RLS automatically; the explicit "service role" policy below is added per
-- the spec and documents the intended access path.
--
-- Schema here is managed out-of-band (the CLI isn't linked); apply this in
-- the Supabase SQL editor.

create table if not exists public.visit_logs (
  id           uuid primary key default gen_random_uuid(),
  dentist_id   uuid references public.dentists(id) on delete set null,
  employee_ref text not null,
  visit_date   date not null default current_date,
  notes        text,
  outcome      text,
  created_at   timestamptz not null default now(),
  constraint visit_logs_outcome_check
    check (outcome is null or outcome in
      ('registered', 'interested', 'not_interested', 'follow_up'))
);

create index if not exists visit_logs_employee_date_idx
  on public.visit_logs (employee_ref, visit_date desc);
create index if not exists visit_logs_dentist_idx
  on public.visit_logs (dentist_id);

alter table public.visit_logs enable row level security;

drop policy if exists "Service role manages visit_logs" on public.visit_logs;
create policy "Service role manages visit_logs"
  on public.visit_logs
  for all
  to service_role
  using (true)
  with check (true);
