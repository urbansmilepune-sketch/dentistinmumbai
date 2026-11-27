-- "Your week on DentistIn" (approved 27 Nov 2026, weekly-activity/mockup.html).
--
-- 1. case_views: which dentist viewed which case, once per dentist per case
--    per day (India time). The author's own views are never saved. Feeds
--    "who viewed your cases" on the dentist home card and /week.
-- 2. Two new columns on dentists:
--    week_card_hidden_until  the dentist closed the card; hidden until next Monday
--    week_recap_sent_at      last Monday WhatsApp "Your week" recap (once a week)
--
-- Run by hand in the Supabase SQL editor. Safe to run more than once.
-- Server-only table (RLS on, no policies): the app reads and writes it with
-- the service key after checking who is signed in. The site keeps working
-- before this runs; the card just shows 0 views.

create table if not exists public.case_views (
  case_id uuid not null references public.cases(id) on delete cascade,
  viewer_id uuid not null references public.dentists(id) on delete cascade,
  author_id uuid not null references public.dentists(id) on delete cascade,
  viewed_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at timestamptz not null default now(),
  primary key (case_id, viewer_id, viewed_on)
);
create index if not exists case_views_author_idx on public.case_views (author_id, created_at desc);
alter table public.case_views enable row level security;

alter table public.dentists add column if not exists week_card_hidden_until timestamptz;
alter table public.dentists add column if not exists week_recap_sent_at timestamptz;

-- Check: should say case_views, then the two dentists columns.
select table_name as created from information_schema.tables
where table_schema = 'public' and table_name = 'case_views'
union all
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'dentists'
  and column_name in ('week_card_hidden_until', 'week_recap_sent_at');
