-- Recall reminders — automated "you're due for a checkup" pings sent to
-- patients on a schedule the dentist sets when they close out an
-- appointment. One row per scheduled future ping; cron flips status to
-- 'sent' (or 'cancelled' if the patient books again first).
--
-- Reminder types track WHY we're pinging — a 6-month checkup defaults to
-- different copy than a treatment-specific follow-up. The cron only cares
-- about due_date + status, but the type lets the dashboard group rows and
-- the message template logic pick the right body.
--
-- patient_id is nullable on the FK so closing a patient record doesn't
-- cascade-delete the recall history (matches lab_work + message_log).
-- dentist_id is required and cascades — when a dentist account is removed,
-- their recall list goes with it.

create table if not exists public.recall_reminders (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid references public.patients(id) on delete set null,
  dentist_id      uuid not null references public.dentists(id) on delete cascade,
  reminder_type   text,
  due_date        date not null,
  status          text not null default 'pending',
  sent_at         timestamptz,
  message_channel text,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint recall_reminders_type_check
    check (reminder_type is null or reminder_type in ('6month_checkup', 'annual_cleaning', 'follow_up', 'custom')),
  constraint recall_reminders_status_check
    check (status in ('pending', 'sent', 'completed', 'cancelled')),
  constraint recall_reminders_channel_check
    check (message_channel is null or message_channel in ('sms', 'whatsapp', 'email'))
);

-- The daily cron's hot query is `status='pending' and due_date <= today`
-- across every dentist. The partial index keys on (due_date) for pending
-- rows only — completed/sent/cancelled rows don't slow the scan once the
-- table grows past tens of thousands.
create index if not exists recall_reminders_pending_due_idx
  on public.recall_reminders (due_date)
  where status = 'pending';

-- The dashboard list view is dentist-scoped and ordered by due_date.
create index if not exists recall_reminders_dentist_due_idx
  on public.recall_reminders (dentist_id, due_date);

-- The patient profile lists recalls per-patient newest-first.
create index if not exists recall_reminders_patient_idx
  on public.recall_reminders (patient_id, created_at desc)
  where patient_id is not null;

alter table public.recall_reminders enable row level security;

-- Same email-on-dentists pattern as lab_work / message_log. Single combined
-- policy because there's no read/write asymmetry — a dentist either owns
-- the row or they don't.
drop policy if exists "Dentists manage own recall_reminders" on public.recall_reminders;
create policy "Dentists manage own recall_reminders"
  on public.recall_reminders
  for all
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );
