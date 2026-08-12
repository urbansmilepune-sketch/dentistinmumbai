-- The consent-forms "send to patient" workflow (dashboard/consent-forms and the
-- appointments consent modal) writes a much richer row than the original
-- 20260514150000_consent_forms.sql table provided. It stores a flat form_text
-- snapshot (alongside the legacy form_content jsonb), the patient name/phone
-- captured at send time, a status lifecycle, the signing method, and a link
-- back to the originating appointment. Those columns were never added to the
-- live table, so PostgREST rejects every insert/select from that feature with:
--
--   "Could not find the 'form_text' column of 'consent_forms' in the schema cache"
--
-- This migration adds every column that feature reads or writes. All statements
-- are idempotent (ADD COLUMN IF NOT EXISTS / DROP ... IF EXISTS), so it is safe
-- to run against a table that already has some of them.
--
-- APPLIED 2026-08-12. Written 2026-06-23 but not run until now — the send
-- workflow was broken for the whole gap. Verified live the same day: all ten
-- columns present, patient_id accepts NULL, and a free-text form_type inserts
-- (the old five-value CHECK is gone), so the columns and both constraint
-- changes below are confirmed in place.

alter table public.consent_forms
  add column if not exists form_title       text,
  add column if not exists form_text        text,
  add column if not exists patient_name     text,
  add column if not exists patient_phone    text,
  add column if not exists status           text,
  add column if not exists sent_at          timestamptz,
  add column if not exists signed_by        text,
  add column if not exists signature_method text,
  add column if not exists notes            text,
  add column if not exists appointment_id   uuid references public.appointments(id) on delete set null;

-- The new workflow can send a consent form to someone who isn't a registered
-- patient yet (identified only by name/phone), so patient_id must be nullable.
-- The original table declared it NOT NULL.
alter table public.consent_forms
  alter column patient_id drop not null;

-- form_type is now driven by user-defined consent_templates, whose types are
-- free text. The original five-value CHECK constraint would reject otherwise
-- valid sends, so drop it.
alter table public.consent_forms
  drop constraint if exists consent_forms_form_type_check;

create index if not exists consent_forms_appointment_idx
  on public.consent_forms (appointment_id);
create index if not exists consent_forms_status_idx
  on public.consent_forms (status);
