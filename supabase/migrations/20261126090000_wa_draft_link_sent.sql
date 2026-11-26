-- WhatsApp case posting: remember when the case link was sent for a draft,
-- so it goes out exactly once (after the dentist's details, "skip", or 2 min).
alter table public.whatsapp_case_drafts add column if not exists link_sent_at timestamptz;
