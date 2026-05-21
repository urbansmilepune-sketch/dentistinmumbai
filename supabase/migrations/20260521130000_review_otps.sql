-- review_otps backs the patient-side "leave a review" flow: a 6-digit OTP is
-- texted to the patient's phone via the MSG91 DLT-approved REVIEW_OTP
-- template, then verified before the review row is written. The table is
-- created here (the prior, hand-rolled Supabase Studio version is not in
-- migrations history) and made forward-compatible with the existing
-- /api/reviews send_otp action, which uses a `verified` column with an
-- upsert keyed on phone.
--
-- Both column sets are kept so the legacy endpoint and the new
-- /api/reviews/otp endpoint can coexist during the cut-over:
--   used      — new endpoint marks rows used after OTP verification
--   verified  — legacy endpoint flips this on submit_review
--   dentist_id— new endpoint records which dentist the OTP is bound to
create table if not exists public.review_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  otp text not null,
  dentist_id uuid references public.dentists(id),
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

-- Idempotent column adds for environments where the table already exists
-- (created manually via Supabase Studio with a narrower shape).
alter table public.review_otps add column if not exists id uuid default gen_random_uuid();
alter table public.review_otps add column if not exists dentist_id uuid references public.dentists(id);
alter table public.review_otps add column if not exists used boolean default false;
alter table public.review_otps add column if not exists verified boolean default false;
alter table public.review_otps add column if not exists created_at timestamptz default now();

create index if not exists review_otps_phone_idx on public.review_otps (phone);
create index if not exists review_otps_expires_at_idx on public.review_otps (expires_at);
