-- Patient reviews v1 (4 Nov 2026).
--
-- review_requests: one row per "please rate your visit" link. The token in
-- the link is the proof that the patient was sent it, so the review page
-- needs no OTP. Rows come from two places:
--   auto   — dentist marks an appointment Done; the 5-minute WhatsApp cron
--            sends it once send_after has passed.
--   manual — dentist taps "Ask for review"; the link opens in WhatsApp on
--            their own phone (sent_at is set straight away).
--
-- Only the service role touches this table (RLS on, no policies).
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.review_requests (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  dentist_id      uuid not null references public.dentists(id) on delete cascade,
  appointment_id  uuid,
  patient_name    text,
  patient_phone   text,
  treatment       text,
  visit_date      date,
  source          text not null default 'auto',
  send_after      timestamptz not null default now(),
  sent_at         timestamptz,
  send_channel    text,
  send_error      text,
  opened_at       timestamptz,
  used_at         timestamptz,
  review_id       uuid,
  expires_at      timestamptz not null default (now() + interval '30 days'),
  created_at      timestamptz not null default now()
);

-- One link per appointment, so marking Done twice never sends twice.
create unique index if not exists review_requests_appointment_uidx
  on public.review_requests (appointment_id) where appointment_id is not null;
create index if not exists review_requests_unsent_idx
  on public.review_requests (send_after) where sent_at is null;
create index if not exists review_requests_dentist_idx
  on public.review_requests (dentist_id, created_at desc);

alter table public.review_requests enable row level security;

-- New columns on the existing reviews table.
alter table public.reviews add column if not exists appointment_id    uuid;
alter table public.reviews add column if not exists review_request_id uuid;
alter table public.reviews add column if not exists verified_visit    boolean not null default false;
alter table public.reviews add column if not exists tags              text[]  not null default '{}';
alter table public.reviews add column if not exists dentist_reply     text;
alter table public.reviews add column if not exists dentist_reply_at  timestamptz;
alter table public.reviews add column if not exists created_at        timestamptz not null default now();

-- The text box is optional on the new review page.
alter table public.reviews alter column review_text drop not null;

-- One review per link.
create unique index if not exists reviews_review_request_uidx
  on public.reviews (review_request_id) where review_request_id is not null;

-- Check (should list the 6 new columns and the new table):
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'reviews'
   and column_name in ('appointment_id','review_request_id','verified_visit','tags','dentist_reply','dentist_reply_at')
union all
select 'review_requests table', case when to_regclass('public.review_requests') is null then 'MISSING' else 'ok' end;
