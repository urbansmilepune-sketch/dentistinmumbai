-- Review requests v1.1 (4 Nov 2026): visits saved in the clinic software
-- also send a review link, and an SMS goes 24 hours later if the patient
-- hasn't reviewed. Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.review_requests add column if not exists visit_id    uuid;
alter table public.review_requests add column if not exists sms_sent_at timestamptz;

-- For the "one request per patient per clinic every 30 days" check.
create index if not exists review_requests_dentist_phone_idx
  on public.review_requests (dentist_id, patient_phone, created_at desc);

-- Check (should list both columns):
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'review_requests'
   and column_name in ('visit_id', 'sms_sent_at');
