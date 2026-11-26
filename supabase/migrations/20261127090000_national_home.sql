-- dentistinindia.in login + dentist home (27 Nov 2026).
--
-- 1. network_posts / network_post_replies: "Question" and "Update" posts on
--    the dentist home Post wall (cases keep using the cases table).
-- 2. login_handoffs: one-time links behind "Manage my clinic". A tap on
--    dentistinindia.in creates a random token (only its SHA-256 hash is
--    stored here), valid for 2 minutes and usable once, that signs the
--    dentist in on their city site's dashboard.
--
-- Run by hand in the Supabase SQL editor. Safe to run more than once.
-- The app keeps working before this runs: the Question/Update tabs say
-- "coming soon" and "Manage my clinic" opens the city login page instead.
-- All three tables are server-only (RLS on, no policies): the app reads and
-- writes them with the service key after checking who is signed in.

create table if not exists public.network_posts (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  kind text not null check (kind in ('question', 'update')),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'live' check (status in ('live', 'hidden')),
  reply_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists network_posts_feed_idx on public.network_posts (status, created_at desc);
create index if not exists network_posts_dentist_idx on public.network_posts (dentist_id, created_at desc);
alter table public.network_posts enable row level security;

create table if not exists public.network_post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.network_posts(id) on delete cascade,
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists network_post_replies_post_idx on public.network_post_replies (post_id, created_at);
alter table public.network_post_replies enable row level security;

create table if not exists public.login_handoffs (
  token_hash text primary key,
  dentist_id uuid not null references public.dentists(id) on delete cascade,
  target_host text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_handoffs_expires_idx on public.login_handoffs (expires_at);
alter table public.login_handoffs enable row level security;

-- Check: should list all three tables.
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('network_posts', 'network_post_replies', 'login_handoffs')
order by table_name;
