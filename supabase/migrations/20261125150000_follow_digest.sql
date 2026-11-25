-- Follow, likes and follow alerts on dentistinindia.in (25 Nov 2026).
-- Run once in the Supabase SQL Editor. Safe to run twice.
--
-- Likes (case_likes, cases.like_count) and follows (dentist_follows) reuse
-- the September tables, which are still in the database. The only new
-- thing is a column that stops the weekly follow digest from going out
-- twice to the same dentist.

alter table public.dentists add column if not exists follow_digest_sent_at timestamptz;

-- Check: should return 3 rows (case_likes, dentist_follows, follow_digest_sent_at)
select table_name as name from information_schema.tables
where table_schema = 'public' and table_name in ('case_likes', 'dentist_follows')
union all
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'dentists' and column_name = 'follow_digest_sent_at';
