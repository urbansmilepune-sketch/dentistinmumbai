-- dentist_push_subscriptions — phone alerts (web push) for the dentist app.
--
-- One row per phone/browser that tapped "Turn on alerts". Written and read
-- only by server code with the service role (src/app/api/dentist/push,
-- src/lib/push.ts), so RLS is on with NO policies: nobody can read it from
-- the browser. Rows for uninstalled apps are deleted automatically when a
-- send comes back 404/410.
--
-- prefs: which alerts this phone wants. Keys: booking, change, review.
-- is_owner: false for clinic staff (they never get review alerts, and only
-- while still active in clinic_staff).
--
-- Apply in the Supabase SQL editor (the CLI is not linked to this project).

create table if not exists public.dentist_push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  dentist_id    uuid not null references public.dentists(id) on delete cascade,
  user_email    text not null,
  is_owner      boolean not null default true,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  prefs         jsonb not null default '{"booking": true, "change": true, "review": true}'::jsonb,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists dentist_push_subscriptions_dentist_idx
  on public.dentist_push_subscriptions (dentist_id);

alter table public.dentist_push_subscriptions enable row level security;

-- Check: should return one row, rls_on = true.
select relname, relrowsecurity as rls_on
from pg_class where relname = 'dentist_push_subscriptions';
