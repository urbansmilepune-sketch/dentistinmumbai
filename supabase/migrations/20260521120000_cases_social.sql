-- Phase 1b social layer on top of the clinical case showcase. Four new
-- tables (case_likes, case_saves, case_comments, dentist_follows) +
-- a comment_count column on cases so the trending query can be
-- computed without an aggregate subquery on every request.
--
-- Counters (cases.like_count, cases.comment_count) are kept in sync at
-- the API layer rather than via DB triggers — keeps the migration light
-- and lets us return optimistic counts to the client from the same
-- response. The unique constraint on (case_id, dentist_id) is the real
-- source of truth; the counts are derived.
--
-- RLS shape:
--   case_likes  — public SELECT (so the count is visible without auth),
--                 authenticated dentists INSERT/DELETE their own rows
--   case_saves  — owner-only SELECT/INSERT/DELETE (private bookmark list)
--   case_comments — public SELECT for approved cases' threads,
--                   verified dentists INSERT, owner DELETE
--   dentist_follows — public SELECT (counts visible to everyone),
--                     follower INSERT/DELETE only their own rows


-- ── case_likes ───────────────────────────────────────────────────────
create table if not exists public.case_likes (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id)    on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint case_likes_unique unique (case_id, dentist_id)
);
create index if not exists case_likes_case_id_idx     on public.case_likes (case_id);
create index if not exists case_likes_dentist_id_idx  on public.case_likes (dentist_id);

alter table public.case_likes enable row level security;

create policy if not exists "case_likes public select"
  on public.case_likes for select using (true);

create policy if not exists "case_likes dentist insert own"
  on public.case_likes for insert
  with check (
    exists (select 1 from public.dentists d
            where d.id = dentist_id and d.email = auth.jwt() ->> 'email')
  );

create policy if not exists "case_likes dentist delete own"
  on public.case_likes for delete
  using (
    exists (select 1 from public.dentists d
            where d.id = case_likes.dentist_id and d.email = auth.jwt() ->> 'email')
  );


-- ── case_saves ───────────────────────────────────────────────────────
create table if not exists public.case_saves (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id)    on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint case_saves_unique unique (case_id, dentist_id)
);
create index if not exists case_saves_dentist_id_idx  on public.case_saves (dentist_id, created_at desc);
create index if not exists case_saves_case_id_idx     on public.case_saves (case_id);

alter table public.case_saves enable row level security;

-- Saves are a private bookmark list, so SELECT is also gated to the
-- owning dentist — unlike likes, where the count is public.
create policy if not exists "case_saves dentist select own"
  on public.case_saves for select
  using (
    exists (select 1 from public.dentists d
            where d.id = case_saves.dentist_id and d.email = auth.jwt() ->> 'email')
  );

create policy if not exists "case_saves dentist insert own"
  on public.case_saves for insert
  with check (
    exists (select 1 from public.dentists d
            where d.id = dentist_id and d.email = auth.jwt() ->> 'email')
  );

create policy if not exists "case_saves dentist delete own"
  on public.case_saves for delete
  using (
    exists (select 1 from public.dentists d
            where d.id = case_saves.dentist_id and d.email = auth.jwt() ->> 'email')
  );


-- ── case_comments ────────────────────────────────────────────────────
create table if not exists public.case_comments (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id)    on delete cascade,
  dentist_id  uuid not null references public.dentists(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists case_comments_case_id_idx   on public.case_comments (case_id, created_at asc);
create index if not exists case_comments_dentist_idx   on public.case_comments (dentist_id);

alter table public.case_comments enable row level security;

-- Public read for comments on approved cases — the case-detail page
-- shows the thread to every visitor.
create policy if not exists "case_comments public select via approved case"
  on public.case_comments for select
  using (
    exists (select 1 from public.cases c
            where c.id = case_comments.case_id and c.status = 'approved')
  );

-- Comment insertion requires an MCI-verified dentist (is_verified=true).
-- This is the moderation-light version of "only verified dentists can
-- post". The case must also still be approved and have
-- discussion_enabled — both columns checked server-side in the API too,
-- but the policy enforces the floor.
create policy if not exists "case_comments verified dentist insert"
  on public.case_comments for insert
  with check (
    exists (
      select 1 from public.dentists d
      where d.id = dentist_id
        and d.email = auth.jwt() ->> 'email'
        and d.is_verified = true
    )
    and exists (
      select 1 from public.cases c
      where c.id = case_id
        and c.status = 'approved'
        and c.discussion_enabled = true
    )
  );

create policy if not exists "case_comments dentist delete own"
  on public.case_comments for delete
  using (
    exists (select 1 from public.dentists d
            where d.id = case_comments.dentist_id and d.email = auth.jwt() ->> 'email')
  );


-- ── dentist_follows ──────────────────────────────────────────────────
-- follower_id follows following_id. A dentist cannot follow themselves
-- (CHECK constraint). Counters (follower_count / following_count) are
-- derived via select count(*); we don't store them on dentists to avoid
-- another sync surface — the queries are cheap with the indexes below.

create table if not exists public.dentist_follows (
  id            uuid primary key default gen_random_uuid(),
  follower_id   uuid not null references public.dentists(id) on delete cascade,
  following_id  uuid not null references public.dentists(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint dentist_follows_unique unique (follower_id, following_id),
  constraint dentist_follows_no_self check (follower_id <> following_id)
);
create index if not exists dentist_follows_follower_idx   on public.dentist_follows (follower_id);
create index if not exists dentist_follows_following_idx  on public.dentist_follows (following_id);

alter table public.dentist_follows enable row level security;

create policy if not exists "dentist_follows public select"
  on public.dentist_follows for select using (true);

create policy if not exists "dentist_follows dentist insert own"
  on public.dentist_follows for insert
  with check (
    exists (select 1 from public.dentists d
            where d.id = follower_id and d.email = auth.jwt() ->> 'email')
  );

create policy if not exists "dentist_follows dentist delete own"
  on public.dentist_follows for delete
  using (
    exists (select 1 from public.dentists d
            where d.id = dentist_follows.follower_id and d.email = auth.jwt() ->> 'email')
  );


-- ── Denormalised comment_count on cases ──────────────────────────────
-- Like like_count, kept in sync at the API layer. Lets the trending
-- query compute a score in a single SELECT without an aggregate join.
alter table public.cases
  add column if not exists comment_count int not null default 0;
