-- Case drafts: a dentist can save a half-filled case and finish it later.
-- Drafts are private: RLS is on with no policies, so only the server (service
-- role) reads them, and always filtered to the signed-in dentist. They never
-- touch the public `cases` table until the dentist publishes.
create table if not exists public.case_drafts (
  id                  uuid primary key default gen_random_uuid(),
  dentist_id          uuid not null references public.dentists(id) on delete cascade,
  title               text,
  data                jsonb not null default '{}'::jsonb,
  whatsapp_draft_ids  text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists case_drafts_dentist_idx on public.case_drafts (dentist_id, updated_at desc);
alter table public.case_drafts enable row level security;

-- Check: should return 1 row, case_drafts
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'case_drafts';
