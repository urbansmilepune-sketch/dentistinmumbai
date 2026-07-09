-- dentists.previous_slugs — slug immutability safety net (Week 1 index
-- hygiene, Section 6). The public slug is immutable after first publish
-- (no code path regenerates it), but historical renames left dead indexed
-- URLs. Retired slugs are recorded here so /dentist/[slug] can 308-redirect
-- an old URL to the dentist's current profile instead of 404-ing.
--
-- NOTE: applied out-of-band in the Supabase SQL editor — the CLI isn't
-- linked in this project (no DB password), so `db push` can't run. This
-- file is the reconstructed record of the change applied by hand.

alter table public.dentists
  add column if not exists previous_slugs text[] not null default '{}';

-- GIN index backs the `previous_slugs @> array[<slug>]` containment lookup
-- used by resolveCurrentSlug() on the profile 404 path.
create index if not exists dentists_previous_slugs_gin
  on public.dentists using gin (previous_slugs);

-- Backfill the two confirmed dead slugs → current profiles. Wrapped in a
-- SECURITY DEFINER function per project convention (the SQL editor runs as
-- the anon role; writes to the RLS-protected dentists table must run as
-- definer). Idempotent — the containment guard means re-running is a no-op.
--
-- Resolved live via PostgREST on 2026-07-09:
--   dr-manish-waman-dighade-wakad → urban-smile-orthodontic-and-dental-implant-centre
--                                   (Dr Manish Dighade, pune)
--   dr-sweety-ingole-wakad        → dr-sweety-dighade
--                                   (Dr Sweety, surname Ingole→Dighade — the
--                                    rename that historically broke the slug)
--
-- NOT backfilled (deliberately left to 404/410, per ticket):
--   dr-ashwin-prasad          — no matching record (deleted), not a rename
--   dentist_<hex> ×9, 2 UUIDs — none map to any live dentist row (deleted)
create or replace function public.backfill_previous_slug(current_slug text, old_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dentists
     set previous_slugs = array_append(previous_slugs, old_slug)
   where slug = current_slug
     and not (previous_slugs @> array[old_slug]);
end;
$$;

select public.backfill_previous_slug('urban-smile-orthodontic-and-dental-implant-centre', 'dr-manish-waman-dighade-wakad');
select public.backfill_previous_slug('dr-sweety-dighade', 'dr-sweety-ingole-wakad');

drop function public.backfill_previous_slug(text, text);
