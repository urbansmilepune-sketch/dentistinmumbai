-- Audit trail for the dentist Communications tab. Mirror of the existing
-- admin_communications_log (one row per blast, regardless of recipient
-- count), but scoped to a dentist sending to their own patients.
--
-- channel  — 'email' or 'whatsapp'. WhatsApp rows record what was queued
--            for opening in client tabs; we can't confirm delivery there
--            so failed_count is informational at best on those rows.
-- mode     — same three send modes the UI exposes: a single patient,
--            a hand-picked checkbox list, or "all my patients".
--
-- subject is nullable because WhatsApp doesn't have a subject line; the
-- column carries the email subject when channel='email', NULL otherwise.

create table if not exists public.communications_log (
  id               uuid primary key default gen_random_uuid(),
  dentist_id       uuid not null references public.dentists(id) on delete cascade,
  channel          text not null,
  mode             text not null,
  subject          text,
  message          text not null,
  recipients_count int  not null default 0,
  failed_count     int  not null default 0,
  status           text not null default 'sent',
  sent_at          timestamptz not null default now(),
  constraint communications_log_channel_check
    check (channel in ('email', 'whatsapp')),
  constraint communications_log_mode_check
    check (mode in ('individual', 'selected', 'all'))
);

create index if not exists communications_log_dentist_sent_idx
  on public.communications_log (dentist_id, sent_at desc);

-- Owner-only access: dentists read and write their own audit rows. The
-- API uses the user-bound supabase client (RLS-aware) for inserts, so
-- this policy guards both write and read paths.
alter table public.communications_log enable row level security;

drop policy if exists "Dentists manage own communications_log" on public.communications_log;
create policy "Dentists manage own communications_log"
  on public.communications_log
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
