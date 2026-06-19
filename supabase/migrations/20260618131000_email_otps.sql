-- Email login OTPs. Backs the "Login with Email OTP" method on the dentist
-- login page (/for-dentists/login): /api/auth/email-otp/send writes a row with
-- a bcrypt hash of a 6-digit code, /api/auth/email-otp/verify checks it and
-- then mints a Supabase magic link to create the session.
--
-- Only the OTP *hash* is stored (bcrypt) — never the plaintext code — so a DB
-- leak doesn't hand out live login codes. Codes expire 10 minutes after issue
-- (expires_at) and are single-use (used_at stamped on a successful verify).
--
-- Both routes talk to this table exclusively through the service-role key,
-- which bypasses RLS. RLS is enabled with NO policies so the anon/authenticated
-- PostgREST roles cannot read OTP hashes or harvest the email list — this table
-- is pre-auth (no dentist session exists yet at send/verify time), so the
-- email-on-dentists ownership pattern used elsewhere doesn't apply here.

create table if not exists public.email_otps (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  otp_hash   text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Verify looks up the newest unused, unexpired row for an email; this index
-- backs the (email, expires_at) lookup.
create index if not exists email_otps_email_expires_idx
  on public.email_otps (email, expires_at);

alter table public.email_otps enable row level security;
