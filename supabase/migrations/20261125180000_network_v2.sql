-- Dentist network v2 (25 Nov 2026): follow-up reminders and posting a
-- case by WhatsApp. Run once in the Supabase SQL Editor. Safe to run twice.
-- New tables have RLS on and no policies: only the server (service role)
-- reads or writes them.

-- 1. One row per (case, milestone) reminder sent, so each goes once.
create table if not exists public.case_followup_reminders (
  case_id   uuid not null references public.cases(id) on delete cascade,
  months    int  not null check (months in (3, 6, 12)),
  sent_at   timestamptz not null default now(),
  primary key (case_id, months)
);
alter table public.case_followup_reminders enable row level security;

-- 2. Photos a dentist sends on WhatsApp, waiting to become a case on /cases/new.
create table if not exists public.whatsapp_case_drafts (
  id          uuid primary key default gen_random_uuid(),
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  photo_urls  text[] not null default '{}',
  note        text,
  replied_at  timestamptz,
  used_at     timestamptz,
  case_id     uuid references public.cases(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_case_drafts_dentist_idx on public.whatsapp_case_drafts (dentist_id, created_at desc);
alter table public.whatsapp_case_drafts enable row level security;

-- 3. Raw log of every inbound WhatsApp webhook call (to check MSG91's format).
create table if not exists public.whatsapp_inbound_log (
  id            bigint generated always as identity primary key,
  phone         text,
  content_type  text,
  payload       jsonb,
  created_at    timestamptz not null default now()
);
alter table public.whatsapp_inbound_log enable row level security;

-- Check: should list 3 tables
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('case_followup_reminders', 'whatsapp_case_drafts', 'whatsapp_inbound_log');
