-- Two additions for the new birthday + post-treatment-followup crons:
--
--   1. patients.date_of_birth — required by the birthday cron. The
--      existing `age` column is a snapshot from the day the patient was
--      registered; you can't drive a "wish them happy birthday" trigger
--      from it. Nullable so legacy patient rows stay valid.
--
--   2. message_log — per-recipient audit trail. The existing
--      `communications_log` table (created in 20260517160000) is a
--      per-BLAST log: one row per send job, with recipients_count /
--      failed_count aggregated. That's the right shape for the bulk-
--      send UI's history panel but the wrong shape for cron dedupe.
--      message_log is one row per individual message sent so the
--      follow-up cron can ask "did we already send a follow-up for
--      appointment <id>?" with a simple existence check.

alter table public.patients
  add column if not exists date_of_birth date;

-- Cheap index keyed on the (month, day) extraction — the birthday cron
-- runs a substring match against today's MM-DD so this gives it a single-
-- column lookup instead of a full table scan once patient volume grows.
create index if not exists patients_birthday_md_idx
  on public.patients (to_char(date_of_birth, 'MM-DD'))
  where date_of_birth is not null;

-- ---------------------------------------------------------------------------
-- message_log — one row per individual message sent to a single patient.
--
-- appointment_id is a small extension of the requested schema. Without it
-- the post-treatment-followup cron has no clean way to dedupe re-sends if
-- it runs twice or if the same appointment row gets re-completed; with it
-- the cron just does a NOT EXISTS lookup. NULL is fine for messages that
-- aren't tied to an appointment (birthday, ad-hoc replies, etc.).
-- ---------------------------------------------------------------------------
create table if not exists public.message_log (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid references public.patients(id) on delete set null,
  dentist_id      uuid not null references public.dentists(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,
  message_type    text,
  channel         text,
  message_content text,
  status          text not null default 'sent',
  sent_at         timestamptz not null default now(),
  constraint message_log_channel_check
    check (channel is null or channel in ('sms', 'whatsapp', 'email'))
);

create index if not exists message_log_dentist_sent_idx
  on public.message_log (dentist_id, sent_at desc);
create index if not exists message_log_patient_type_idx
  on public.message_log (patient_id, message_type, sent_at desc);
-- Partial index for the follow-up cron's dedupe lookup.
create index if not exists message_log_appointment_idx
  on public.message_log (appointment_id, message_type)
  where appointment_id is not null;

alter table public.message_log enable row level security;

-- Same email-on-dentists pattern as the rest of the schema. Single
-- combined policy because dentists never need cross-policy nuance here.
drop policy if exists "Dentists manage own message_log" on public.message_log;
create policy "Dentists manage own message_log"
  on public.message_log
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
