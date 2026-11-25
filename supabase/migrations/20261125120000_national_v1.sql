-- DentistIn India v1: run this ONCE in Supabase > SQL Editor, BEFORE merging the PR.
-- Safe to run twice (everything uses "if not exists").
-- Adds: reply types + "helpful" marks, case question / consent / follow-up month,
-- dentist top skills + one-line intro, events calendar + "going" / reminders.
-- All new tables are read and written only by the website's server (service role),
-- so RLS is on with no public policies.

-- 1. Reply type on case comments: suggestion / question / comment
alter table public.case_comments add column if not exists kind text not null default 'comment';
do $$ begin
  alter table public.case_comments add constraint case_comments_kind_check
    check (kind in ('suggestion', 'question', 'comment'));
exception when duplicate_object then null; end $$;

-- 2. "Helpful" marks on replies (one per dentist per reply)
create table if not exists public.case_comment_helpful (
  comment_id  uuid not null references public.case_comments(id) on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, dentist_id)
);
alter table public.case_comment_helpful enable row level security;

-- 3. Cases: the question asked, patient consent, follow-up month on photos
alter table public.cases add column if not exists question text;
alter table public.cases add column if not exists patient_consent boolean not null default false;
alter table public.case_photos add column if not exists months_after int;

-- 4. Dentist national profile: top 3 skills, one line for patients, claim time
alter table public.dentists add column if not exists top_skills text[] not null default '{}';
alter table public.dentists add column if not exists patient_line text;
alter table public.dentists add column if not exists network_claimed_at timestamptz;

-- 5. Events and courses
create table if not exists public.events (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  kind                text not null default 'seminar'
                        check (kind in ('exhibition', 'course', 'seminar', 'study_club', 'conference')),
  topic               text,
  city                text,
  is_online           boolean not null default false,
  starts_on           date not null,
  ends_on             date,
  organiser           text,
  fee_text            text,
  link                text,
  description         text,
  gives_certificate   boolean not null default false,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  submitted_by        uuid references public.dentists(id) on delete set null,
  submitter_email     text,
  created_at          timestamptz not null default now()
);
create index if not exists events_status_start_idx on public.events (status, starts_on);
alter table public.events enable row level security;

create table if not exists public.event_interest (
  event_id    uuid not null references public.events(id) on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  going       boolean not null default false,
  remind      boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (event_id, dentist_id)
);
alter table public.event_interest enable row level security;

-- Check: should list 3 new tables
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('case_comment_helpful', 'events', 'event_interest');
