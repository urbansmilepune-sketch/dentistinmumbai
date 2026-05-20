-- Patient + dentist interest captured against a coming-soon city on
-- dentistinindia.in. POST /api/waitlist inserts rows via the service role;
-- there are no public-readable policies, so patient emails are not exposed
-- via the anon key. Unique (email, city_slug) so the same person clicking
-- "Notify me" twice for the same city is a no-op rather than a duplicate.
--
-- city_slug is intentionally untyped against the CITY_CONFIGS or
-- COMING_SOON_CITIES whitelist at the DB level — validation lives in the
-- POST route. Storing as plain text keeps the table portable if we later
-- want to capture interest in a city we haven't even added to the config.

create table if not exists public.city_waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  city_slug   text not null,
  source      text,
  created_at  timestamptz not null default now(),
  constraint city_waitlist_email_city_unique unique (email, city_slug)
);

create index if not exists city_waitlist_city_slug_idx
  on public.city_waitlist (city_slug);
create index if not exists city_waitlist_created_at_idx
  on public.city_waitlist (created_at desc);

alter table public.city_waitlist enable row level security;
