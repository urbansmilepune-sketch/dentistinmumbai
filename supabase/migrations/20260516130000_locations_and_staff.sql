-- Two related additions to the dentist account model:
--
--   clinic_locations  — a dentist can own one or many physical clinics.
--                       The primary location is what the public profile and
--                       booking flow show in the hero card; the others
--                       surface as a tab strip on the profile when count > 1.
--                       Migration creates the rows lazily — there is no
--                       backfill from the existing dentists.address/phone
--                       columns. New dentists pick this up immediately; old
--                       dentists keep working with zero locations until they
--                       open the Locations page.
--
--   clinic_staff      — invited team members (reception, associate dentists)
--                       who log in with their own auth.users row but operate
--                       on the owner dentist's data. user_id is filled when
--                       the staff member accepts the magic-link invite; until
--                       then status='invited' is the source of truth.

-- ---------- clinic_locations -----------------------------------------------
create table if not exists public.clinic_locations (
  id              uuid primary key default gen_random_uuid(),
  dentist_id      uuid not null references public.dentists(id) on delete cascade,
  name            text not null,
  address         text not null default '',
  area_id         uuid references public.areas(id),
  area_name_raw   text,
  city            text not null default 'mumbai',
  phone           text,
  working_hours   jsonb,
  is_primary      boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists clinic_locations_dentist_idx
  on public.clinic_locations (dentist_id);

-- Enforce "at most one primary per dentist". Partial unique so multiple
-- non-primary locations are fine.
create unique index if not exists clinic_locations_one_primary_per_dentist
  on public.clinic_locations (dentist_id)
  where is_primary = true;

alter table public.clinic_locations enable row level security;

-- Public read — patient-facing profile pages use the anon client.
drop policy if exists "Public reads clinic_locations" on public.clinic_locations;
create policy "Public reads clinic_locations"
  on public.clinic_locations
  for select
  using (true);

-- Owner write — the dentist whose email matches the JWT can manage rows.
drop policy if exists "Owner writes own clinic_locations" on public.clinic_locations;
create policy "Owner writes own clinic_locations"
  on public.clinic_locations
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- ---------- clinic_staff ----------------------------------------------------
create table if not exists public.clinic_staff (
  id            uuid primary key default gen_random_uuid(),
  dentist_id    uuid not null references public.dentists(id) on delete cascade,
  email         text not null,
  name          text,
  role          text not null,
  user_id       uuid references auth.users(id) on delete set null,
  status        text not null default 'invited',
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz,
  invited_by    uuid references auth.users(id) on delete set null,
  constraint clinic_staff_role_check
    check (role in ('owner', 'associate_dentist', 'reception')),
  constraint clinic_staff_status_check
    check (status in ('invited', 'active', 'removed'))
);

-- A given email can only be invited once per dentist; case-insensitive to
-- catch the "DR.Bob@..." vs "dr.bob@..." footgun.
create unique index if not exists clinic_staff_dentist_email_idx
  on public.clinic_staff (dentist_id, lower(email));

-- Lookup by email is what /auth/callback uses to route staff to their portal.
create index if not exists clinic_staff_email_idx
  on public.clinic_staff (lower(email));

alter table public.clinic_staff enable row level security;

-- Owner manages their own staff list.
drop policy if exists "Owner manages own clinic_staff" on public.clinic_staff;
create policy "Owner manages own clinic_staff"
  on public.clinic_staff
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- Staff member can read their own row (so the staff portal can show name/role).
drop policy if exists "Staff reads own clinic_staff row" on public.clinic_staff;
create policy "Staff reads own clinic_staff row"
  on public.clinic_staff
  for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));
