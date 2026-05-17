-- Add opt_out_communications to patients.
--
-- The dentist Communications tab fans out marketing-style messages
-- (offers, holiday announcements, new services) to patients. Once a
-- patient asks to be removed from those — by phone, in person, by
-- replying STOP, etc. — the dentist flips this flag and the send route
-- filters them out before generating a single email or wa.me link.
--
-- Default false: existing patients are presumed opted-in (consistent
-- with how every clinic operated before this column existed). The flag
-- is dentist-scoped: a patient who opted out at clinic A still has
-- their own opt_out=false row at clinic B because the patients table
-- is keyed on (dentist_id, patient).

alter table public.patients
  add column if not exists opt_out_communications boolean not null default false;
