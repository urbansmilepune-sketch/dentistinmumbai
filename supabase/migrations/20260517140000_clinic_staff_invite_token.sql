-- Staff invites: replace the Supabase magic-link flow with a permanent,
-- single-use invite token stored on clinic_staff.
--
-- Why: the old flow minted an auth.admin.generateLink (type='invite' or
-- 'magiclink'), which expires in 1–24 hours per Supabase defaults. Staff
-- members who didn't click immediately got a dead link and the owner
-- had no first-class way to re-issue. The new flow stores a random
-- token here, sends them /staff-accept?token=…, and they pick their
-- own password on a branded page that the owner can re-trigger by
-- re-clicking "Invite" — no auth.users row is created until the staff
-- member actually accepts.
--
-- Security shape:
--   - invite_token is a 64-char hex (32 random bytes) — uniformly
--     unguessable.
--   - Single-use: cleared by the /api/staff/accept handler when the
--     row transitions to status='active'. An attacker re-using a
--     leaked-but-already-redeemed token gets a 410 because the lookup
--     finds no matching row.
--   - status='invited' is required at accept time. An already-accepted
--     row is non-redeemable even before the token is cleared.
--
-- We keep the existing joined_at column populated alongside accepted_at
-- so the dashboard staff list (which already reads joined_at) keeps
-- rendering without UI churn.

alter table public.clinic_staff
  add column if not exists invite_token text,
  add column if not exists accepted_at  timestamptz;

-- Unique partial index: NULL after accept, so the constraint only
-- applies to rows that currently have a live token.
create unique index if not exists clinic_staff_invite_token_unique
  on public.clinic_staff (invite_token)
  where invite_token is not null;

-- Allow the unauthenticated /staff-accept page (server component) to
-- read a single row by token. The token itself is the credential; RLS
-- gates the lookup on `invite_token = current_setting('request.headers')...`
-- isn't possible cleanly, so the lookup is done via the service-role
-- client in /api/staff/accept and on the server-component page. We do
-- NOT add a public-read RLS policy here — that would leak the entire
-- table to anyone holding the anon key.
