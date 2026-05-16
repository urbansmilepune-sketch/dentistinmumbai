-- Audit trail for the admin Communications tab. One row per blast (regardless
-- of recipient count). Lets the admin see what was sent, when, by whom, and
-- how many recipients actually received it — Resend logs are the source of
-- truth per-recipient, but this table answers "what blasts went out from us".
--
-- sent_by stores the admin's email at send time (not a FK to admin_users —
-- if an admin's row is later removed we still want the audit history
-- intact). recipient_count == successful sends; failed_count covers
-- Resend rejections.
--
-- city_filters and tier_filter are populated only when the matching mode
-- was used; the other column is NULL on each row. Storing the raw filter
-- values rather than dereferencing to dentist ids keeps rows compact and
-- still tells the story.

create table if not exists public.admin_communications_log (
  id               uuid primary key default gen_random_uuid(),
  sent_by          text not null,
  mode             text not null,
  subject          text not null,
  message          text not null,
  recipient_count  int not null default 0,
  failed_count     int not null default 0,
  city_filters     text[],
  tier_filter      text,
  created_at       timestamptz not null default now(),
  constraint admin_communications_log_mode_check
    check (mode in ('individual', 'bulk', 'city'))
);

create index if not exists admin_communications_log_created_at_idx
  on public.admin_communications_log (created_at desc);

-- RLS — service role writes from the API route; no public reads.
alter table public.admin_communications_log enable row level security;

-- No anon read policy is created on purpose. The admin GET handler uses the
-- service-role key + an admin_users gate to fetch rows; anon users see
-- nothing. Same pattern other admin-only tables use.
