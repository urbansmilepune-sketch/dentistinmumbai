-- Clinical case showcase tables for the dentist professional social
-- network on dentistinindia.in. Three new tables (cases, case_photos,
-- case_reports) + four new free-text columns on dentists for the
-- professional profile page.
--
-- A case is a clinical write-up authored by a verified dentist. New
-- cases default to status='pending'; the create endpoint flips them to
-- 'approved' automatically once the dentist already has ≥3 approved
-- cases (the "first three need admin review, then auto-approve" rule
-- in the product spec). Once approved, the case is public-readable on
-- /cases and /cases/[id] regardless of whether the viewer is signed in.
--
-- case_photos stores all media (before/after clinical, before/after
-- x-ray) with a `kind` enum + display_order so the case-detail page
-- can show them in the right order without an extra join. URL points
-- to Cloudinary — same pattern as gallery_photos.
--
-- case_reports captures abuse / accuracy complaints; admin reviews via
-- the new Cases moderation tab. RLS allows authenticated dentists to
-- create reports but not read them back (admin-only via service role).

create table if not exists public.cases (
  id                  uuid primary key default gen_random_uuid(),
  dentist_id          uuid not null references public.dentists(id) on delete cascade,
  title               text not null,
  specialty           text not null,
  complexity          int not null default 1
                        check (complexity between 1 and 5),
  description         text,
  materials           text[] not null default '{}',
  cost_min            int,
  cost_max            int,
  duration_weeks      int,
  clinical_notes      text,
  is_private_notes    boolean not null default false,
  discussion_enabled  boolean not null default true,
  status              text not null default 'pending'
                        check (status in ('draft', 'pending', 'approved', 'rejected')),
  rejected_reason     text,
  view_count          int not null default 0,
  like_count          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists cases_dentist_id_idx     on public.cases (dentist_id);
create index if not exists cases_status_idx         on public.cases (status);
create index if not exists cases_specialty_idx      on public.cases (specialty);
create index if not exists cases_created_at_idx     on public.cases (created_at desc);


create table if not exists public.case_photos (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references public.cases(id) on delete cascade,
  url             text not null,
  kind            text not null
                    check (kind in ('before', 'after', 'xray_before', 'xray_after')),
  caption         text,
  display_order   int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists case_photos_case_id_idx
  on public.case_photos (case_id, display_order);


create table if not exists public.case_reports (
  id                    uuid primary key default gen_random_uuid(),
  case_id               uuid not null references public.cases(id) on delete cascade,
  reporter_dentist_id   uuid references public.dentists(id) on delete set null,
  reason                text not null,
  status                text not null default 'open'
                          check (status in ('open', 'resolved', 'dismissed')),
  created_at            timestamptz not null default now()
);

create index if not exists case_reports_status_idx
  on public.case_reports (status, created_at desc);


-- Free-text professional-profile fields for /professional/[slug]. We
-- intentionally don't model these as separate tables — CPD points,
-- courses, publications, and hospital affiliations are out of scope
-- for Phase 1a; for now the dentist enters them as Markdown-lite
-- multi-line strings they can edit themselves.

alter table public.dentists
  add column if not exists professional_bio text;
alter table public.dentists
  add column if not exists publications text;
alter table public.dentists
  add column if not exists hospital_affiliations text;


-- RLS — Phase 1a policy intent:
--
--   cases:
--     - public can SELECT rows where status = 'approved'
--     - authenticated dentists can SELECT their own rows in any status
--     - authenticated dentists can INSERT rows where dentist_id matches
--       their own dentists.id
--     - authenticated dentists can UPDATE/DELETE their own rows when
--       status is 'draft' or 'pending'; once approved, only admins
--       (service role) edit
--   case_photos:
--     - inherits from parent case_id via the dentist owning it; public
--       SELECT when parent case is approved
--   case_reports:
--     - authenticated dentists can INSERT (creating a report against any
--       case); no SELECT for non-admins

alter table public.cases         enable row level security;
alter table public.case_photos   enable row level security;
alter table public.case_reports  enable row level security;

create policy if not exists "cases public select approved"
  on public.cases for select
  using (status = 'approved');

create policy if not exists "cases dentist select own"
  on public.cases for select
  using (
    exists (
      select 1 from public.dentists d
      where d.id = cases.dentist_id and d.email = auth.jwt() ->> 'email'
    )
  );

create policy if not exists "cases dentist insert own"
  on public.cases for insert
  with check (
    exists (
      select 1 from public.dentists d
      where d.id = dentist_id and d.email = auth.jwt() ->> 'email'
    )
  );

create policy if not exists "cases dentist update own pre-approval"
  on public.cases for update
  using (
    exists (
      select 1 from public.dentists d
      where d.id = cases.dentist_id and d.email = auth.jwt() ->> 'email'
    )
    and status in ('draft', 'pending')
  );

create policy if not exists "case_photos public select via approved case"
  on public.case_photos for select
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_photos.case_id and c.status = 'approved'
    )
  );

create policy if not exists "case_photos dentist select own"
  on public.case_photos for select
  using (
    exists (
      select 1 from public.cases c join public.dentists d on d.id = c.dentist_id
      where c.id = case_photos.case_id and d.email = auth.jwt() ->> 'email'
    )
  );

create policy if not exists "case_photos dentist insert via own case"
  on public.case_photos for insert
  with check (
    exists (
      select 1 from public.cases c join public.dentists d on d.id = c.dentist_id
      where c.id = case_id and d.email = auth.jwt() ->> 'email'
    )
  );

create policy if not exists "case_photos dentist delete via own case"
  on public.case_photos for delete
  using (
    exists (
      select 1 from public.cases c join public.dentists d on d.id = c.dentist_id
      where c.id = case_photos.case_id and d.email = auth.jwt() ->> 'email'
    )
  );

create policy if not exists "case_reports authenticated insert"
  on public.case_reports for insert
  with check (auth.jwt() ->> 'email' is not null);
