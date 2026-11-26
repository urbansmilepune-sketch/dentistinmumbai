-- International events (26 Nov 2026): a country on every event.
-- Run once in the Supabase SQL Editor. Safe to run twice.
-- Indian events keep 'India'; international ones store the country name.
alter table public.events add column if not exists country text not null default 'India';
create index if not exists events_country_idx on public.events (country);

-- Check: should list 1 column
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'events' and column_name = 'country';
