-- Run once in Supabase SQL Editor before merging the webhook fix PR.
-- Adds an "outcome" note to each WhatsApp message row (what the webhook did with it)
-- and a message id so MSG91 retries and photo albums never create duplicates.
alter table public.whatsapp_inbound_log add column if not exists outcome text;
alter table public.whatsapp_inbound_log add column if not exists message_id text;
create unique index if not exists whatsapp_inbound_log_message_id_idx
  on public.whatsapp_inbound_log (message_id) where message_id is not null;

-- After a test, run this to see what happened to the last 10 messages:
select id, phone, content_type, outcome, created_at
from public.whatsapp_inbound_log
order by id desc
limit 10;
