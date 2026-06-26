-- Unique index on dentist_treatments(dentist_id, treatment_id).
--
-- dentist_treatments was created out-of-band in Studio (see
-- 20260516140000_dentist_treatments_rls.sql) and never had this constraint.
-- Adding it (1) lets the universal-treatment seeding use a true
-- ON CONFLICT DO NOTHING upsert if desired, and (2) stops the dashboard's
-- "Add treatment" action and the approval auto-seed from ever creating
-- duplicate (dentist, treatment) rows.
--
-- The seeding code does NOT depend on this index — both the backfill script
-- and the approval hook are idempotent in application logic (insert-only-
-- missing) — but the index is cheap hardening and makes the invariant real.
--
-- IMPORTANT: the Supabase CLI is not linked in this project (no `db push`), so
-- this migration will NOT auto-apply. Apply it once manually in the Supabase
-- SQL editor. It is safe: a read-only audit on 2026-06-26 found 0 duplicate
-- (dentist_id, treatment_id) pairs across 263 rows, so the index builds
-- cleanly. Re-runnable via IF NOT EXISTS.

create unique index if not exists dentist_treatments_dentist_treatment_uniq
  on public.dentist_treatments (dentist_id, treatment_id);
