-- Activity alerts for dentistinindia.in (27 Nov 2026).
--
-- 1. network_alerts: one row per "Dr X followed you / liked your case /
--    replied on your case / replied to your post / marked your reply helpful".
--    Shown in the bell and the Alerts page, and rolled up into phone alerts
--    and the WhatsApp activity summary.
-- 2. Three new columns on dentists:
--    network_alert_prefs  the dentist's switches on Alert settings
--    network_seen_at      last time they opened dentistinindia.in (signed in)
--    alerts_whatsapp_at   last WhatsApp activity summary sent (max 2 a week)
--
-- Run by hand in the Supabase SQL editor. Safe to run more than once.
-- Server-only table (RLS on, no policies): the app reads and writes it with
-- the service key after checking who is signed in. The app keeps working
-- before this runs; it just saves no alerts.

create table if not exists public.network_alerts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.dentists(id) on delete cascade,
  actor_id uuid not null references public.dentists(id) on delete cascade,
  kind text not null check (kind in ('follow', 'case_like', 'case_comment', 'post_reply', 'helpful')),
  case_id uuid references public.cases(id) on delete cascade,
  post_id uuid references public.network_posts(id) on delete cascade,
  comment_id uuid,
  snippet text,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  pushed_at timestamptz,
  whatsapp_at timestamptz
);
create index if not exists network_alerts_recipient_idx on public.network_alerts (recipient_id, created_at desc);
create index if not exists network_alerts_unseen_idx on public.network_alerts (recipient_id) where seen_at is null;
create index if not exists network_alerts_actor_idx on public.network_alerts (actor_id, kind);
alter table public.network_alerts enable row level security;

alter table public.dentists add column if not exists network_alert_prefs jsonb not null default '{}'::jsonb;
alter table public.dentists add column if not exists network_seen_at timestamptz;
alter table public.dentists add column if not exists alerts_whatsapp_at timestamptz;

-- Check: should say network_alerts, then the three dentists columns.
select 'table' as what, table_name as name from information_schema.tables
where table_schema = 'public' and table_name = 'network_alerts'
union all
select 'column', column_name from information_schema.columns
where table_schema = 'public' and table_name = 'dentists'
  and column_name in ('network_alert_prefs', 'network_seen_at', 'alerts_whatsapp_at');
