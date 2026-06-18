-- Per-dentist usage log for the AI assistant endpoints (prescription-suggest,
-- refine-notes). One row per successful Anthropic call. Used to enforce a
-- daily per-dentist cap (20 calls/day) so a single dentist can't hammer the
-- API by accident or intent.
--
-- This table is PHI-free by design: it records only which dentist made a call,
-- which action, the token count, and when. It never stores prompts, diagnoses,
-- notes, or any patient-derived text.
--
-- Rows are written exclusively by the service-role API routes — dentists may
-- read their own usage (for a possible "X/20 used today" UI) but never insert
-- or delete, so they can't reset their own counter. Follows the
-- email-on-dentists RLS pattern shared by bug_reports, clinic_expenses, etc.

create table if not exists public.ai_usage_log (
  id          uuid primary key default gen_random_uuid(),
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  action      text,
  tokens_used integer,
  created_at  timestamptz not null default now()
);

-- Backs the "count this dentist's rows since start-of-day" rate-limit query.
create index if not exists ai_usage_log_dentist_created_idx
  on public.ai_usage_log (dentist_id, created_at desc);

alter table public.ai_usage_log enable row level security;

-- Read-only for the owning dentist. No insert/update/delete policy: writes go
-- through the service-role key, which bypasses RLS, so a dentist cannot forge
-- or remove usage rows to dodge the cap.
drop policy if exists "Dentists read own ai_usage_log" on public.ai_usage_log;
create policy "Dentists read own ai_usage_log"
  on public.ai_usage_log
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
