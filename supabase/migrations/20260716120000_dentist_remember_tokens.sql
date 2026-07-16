-- "Remember me" persistent-login tokens (free-plan session-timeout workaround).
-- See src/lib/auth/rememberMe.ts. The row id doubles as the rotation "series":
-- token_hash holds the SHA-256 of the current validator, rotated on each use.
--
-- Access is service-role only: RLS is enabled with NO policies, exactly like
-- email_otps, so the anon/user clients can neither read nor write these rows.
--
-- NOTE: this repo's Supabase schema is managed out-of-band (the CLI can't push),
-- so this file is a record of intent — run the same statements in the Supabase
-- SQL editor, then confirm with: node --env-file=.env.local scripts/schema-audit.mjs
create table if not exists public.dentist_remember_tokens (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid references public.dentists(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

create index if not exists dentist_remember_tokens_dentist_id_idx
  on public.dentist_remember_tokens(dentist_id);

alter table public.dentist_remember_tokens enable row level security;
