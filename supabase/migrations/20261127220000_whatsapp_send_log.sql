-- WhatsApp send log for appointment messages (27 Nov 2026).
--
-- One row per booking / confirm / cancel WhatsApp (patient or dentist).
-- status: accepted (MSG91 took it), failed, delivered, read.
-- A late failure reported by MSG91 (e.g. Meta 131048 "spam rate limit hit")
-- arrives on /api/webhooks/msg91-whatsapp-status, marks the row failed and
-- sends the SMS backup stored in sms_fallback. Safe to run twice.
create table if not exists public.whatsapp_send_log (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  template       text not null,
  recipient      text not null check (recipient in ('patient', 'dentist')),
  to_phone       text not null,
  request_id     text,
  status         text not null default 'accepted',
  error          text,
  appointment_id uuid references public.appointments(id) on delete set null,
  dentist_id     uuid references public.dentists(id) on delete set null,
  summary        text,
  sms_fallback   jsonb,
  sms_result     text,
  admin_alerted  boolean not null default false
);
create index if not exists whatsapp_send_log_request_idx on public.whatsapp_send_log (request_id);
create index if not exists whatsapp_send_log_phone_idx on public.whatsapp_send_log (to_phone, created_at desc);
create index if not exists whatsapp_send_log_appt_idx on public.whatsapp_send_log (appointment_id);
alter table public.whatsapp_send_log enable row level security;
-- No policies: only the server (service role) reads and writes it.
