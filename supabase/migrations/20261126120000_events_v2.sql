-- Events v2 (26 Nov 2026): auto-found events, courses, paid Featured
-- listings and alerts to dentists. Run once in the Supabase SQL Editor.
-- Safe to run twice. New tables have RLS on and no policies: only the
-- server (service role) reads or writes them.

-- 1. New columns on events.
alter table public.events add column if not exists source            text not null default 'submitted';
alter table public.events add column if not exists source_url        text;
alter table public.events add column if not exists dedupe_key        text;
alter table public.events add column if not exists submitter_phone   text;
alter table public.events add column if not exists plan              text not null default 'free';
alter table public.events add column if not exists feature_all_india boolean not null default false;
alter table public.events add column if not exists feature_cities    text[] not null default '{}';
alter table public.events add column if not exists feature_days      int;
alter table public.events add column if not exists alert_dentists    int;
alter table public.events add column if not exists amount_rupees     int;
alter table public.events add column if not exists payment_status    text not null default 'none';
alter table public.events add column if not exists payment_link_id   text;
alter table public.events add column if not exists payment_link_url  text;
alter table public.events add column if not exists paid_at           timestamptz;
alter table public.events add column if not exists custom_alert_request text;
alter table public.events add column if not exists approved_at       timestamptz;
alter table public.events add column if not exists featured_until    date;
alter table public.events add column if not exists alert_live_sent_at     timestamptz;
alter table public.events add column if not exists alert_reminder_sent_at timestamptz;
alter table public.events add column if not exists admin_note        text;

do $$ begin
  alter table public.events add constraint events_source_check check (source in ('submitted', 'search'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_plan_check check (plan in ('free', 'featured'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_payment_status_check
    check (payment_status in ('none', 'pending', 'paid', 'refund_due', 'refunded'));
exception when duplicate_object then null; end $$;

create unique index if not exists events_dedupe_key_idx on public.events (dedupe_key) where dedupe_key is not null;
create index if not exists events_payment_link_idx on public.events (payment_link_id) where payment_link_id is not null;

-- 2. Dentists can turn event alerts off (WhatsApp STOP or the email link).
alter table public.dentists add column if not exists event_alerts_off boolean not null default false;

-- 3. One row per (event, dentist, kind) alert, so a retry never sends twice.
create table if not exists public.event_alert_log (
  event_id    uuid not null references public.events(id) on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  kind        text not null check (kind in ('live', 'reminder')),
  email_ok    boolean not null default false,
  whatsapp_ok boolean not null default false,
  sent_at     timestamptz not null default now(),
  primary key (event_id, dentist_id, kind)
);
alter table public.event_alert_log enable row level security;

-- 4. One row per monthly (or "Search now") auto-search run.
create table if not exists public.event_search_runs (
  id             uuid primary key default gen_random_uuid(),
  trigger        text not null default 'cron',
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  found          int not null default 0,
  added          int not null default 0,
  searches       int not null default 0,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cost_usd       numeric(8, 3),
  error          text
);
alter table public.event_search_runs enable row level security;

-- Check: should list 2 tables, then 1 for the dentists column
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('event_alert_log', 'event_search_runs');
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'dentists' and column_name = 'event_alerts_off';
