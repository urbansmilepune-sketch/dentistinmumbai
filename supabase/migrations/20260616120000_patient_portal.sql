-- Patient portal — a public, phone-OTP-authenticated section where a patient
-- can view their own appointments, prescriptions, invoices and visit history.
-- It is NOT behind the dentist login; access is granted per-patient-row by the
-- owning dentist via the portal_access flag.
--
-- Run order: safe to run on an existing DB (every statement is idempotent).

-- Per-patient portal controls.
alter table public.patients add column if not exists portal_access boolean default false;
alter table public.patients add column if not exists portal_pin text;
alter table public.patients add column if not exists portal_last_login timestamptz;

-- Speeds up the phone-based login lookup (patients are matched by the
-- last-10-digits of their phone, but a plain phone index still helps).
create index if not exists patients_phone_idx on public.patients (phone);

-- One active OTP per phone — login mirrors the review_otps flow: a 6-digit
-- code is texted via MSG91, persisted here with a 10-minute expiry, and burnt
-- on successful verification. Upsert on `phone` resets the row on re-send.
create table if not exists public.patient_portal_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  otp text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

create index if not exists patient_portal_otps_phone_idx on public.patient_portal_otps (phone);
create index if not exists patient_portal_otps_expires_at_idx on public.patient_portal_otps (expires_at);

-- Lock the OTP table down. With RLS enabled and NO policies, the anon/auth
-- PostgREST roles are denied entirely — only the service role (which bypasses
-- RLS) can read or write OTPs from the API routes. Without this, the anon key
-- could read every OTP over the REST API.
alter table public.patient_portal_otps enable row level security;
