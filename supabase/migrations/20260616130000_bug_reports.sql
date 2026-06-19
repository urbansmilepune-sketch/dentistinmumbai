-- Dentist-submitted bug reports from the dashboard "Report a bug" button.
--
-- Deliberately PHI-free: a report only ever carries the (redacted) page URL,
-- a snapshot of browser/environment info, and the dentist's free-text
-- description. The API that writes these rows never reads the patients table
-- (or any patient-scoped table), and the page_url is redacted of UUIDs /
-- long digit runs on both the client and the server before it lands here, so
-- a specific patient can't be referenced even indirectly via the URL.
--
-- browser_info is jsonb holding a fixed, allow-listed set of UA/environment
-- fields (userAgent, platform, language, viewport, screen). status defaults
-- to 'open' for triage and flips to 'resolved' out of band.
--
-- Follows the email-on-dentists RLS pattern shared by clinic_expenses,
-- lab_work, patient_images, etc.

create table if not exists public.bug_reports (
  id           uuid primary key default gen_random_uuid(),
  dentist_id   uuid not null references public.dentists(id) on delete cascade,
  page_url     text,
  browser_info jsonb not null default '{}'::jsonb,
  description  text not null,
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  constraint bug_reports_description_not_blank check (length(btrim(description)) > 0),
  constraint bug_reports_status_check check (status in ('open','resolved'))
);

create index if not exists bug_reports_dentist_created_idx
  on public.bug_reports (dentist_id, created_at desc);

alter table public.bug_reports enable row level security;

drop policy if exists "Dentists manage own bug_reports" on public.bug_reports;
create policy "Dentists manage own bug_reports"
  on public.bug_reports
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
