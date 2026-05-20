-- International / NRI dental tourism enquiries captured by the form on
-- dentistinindia.in/dental-tourism. Separate table from `enquiries`
-- (which is per-dentist patient enquiries) because the funnel, fields,
-- and follow-up workflow are different: tourism leads ask about cost,
-- treatment, and stay; clinic-bound enquiries are a single dentist's
-- inbox item.
--
-- treatments stored as text[] so a single lead can flag multiple
-- procedures without exploding into many rows. country is plain text
-- (no FK to a country table) because we'd rather log "Saudi Arabia" or
-- "Trinidad" than reject an unfamiliar value.
--
-- RLS on, no public policies. The POST route writes via service role;
-- only admins read these (Phase 3 admin tab).

create table if not exists public.dental_tourism_enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text,
  country     text,
  treatments  text[] not null default '{}',
  message     text,
  source      text,
  created_at  timestamptz not null default now()
);

create index if not exists dental_tourism_enquiries_created_at_idx
  on public.dental_tourism_enquiries (created_at desc);

alter table public.dental_tourism_enquiries enable row level security;
