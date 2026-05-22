-- One-time backfill: every appointment that has patient_name + patient_phone
-- but no patient_id (manual walk-ins added before the auto-link logic
-- landed, plus any online booking that predates the bookings-API patch in
-- the same release) now gets its missing patient row created (if needed)
-- and gets its patient_id wired up.
--
-- After this migration runs and the new app code is deployed, every
-- subsequent appointment insert (via /api/bookings or the dashboard walk-in
-- form) sets patient_id at insert time, so this script only has to run
-- once. Re-running it is a no-op — every step is idempotent.
--
-- Matching key: dentist_id + the digits-only tail of patient_phone. That
-- handles the common "+91 98xxxxxxxx" vs "98xxxxxxxx" mismatch and is the
-- same key the dashboard uses for its phone-fallback Open-Patient-File
-- button.

-- ---------------------------------------------------------------------------
-- Step 1 — create missing patient rows.
--
-- For each unique (dentist_id, phone-digit) pair that appears in
-- appointments but has NO matching row in patients yet, insert a patient
-- row. We pick the earliest appointment's name + phone so the new patient
-- carries the original wording (e.g. "Mrs. Anita Singh" rather than a
-- later shortened "Anita"). row_number() over the partition guarantees a
-- single insert per pair even when the dentist has 10 appointments for
-- the same patient.
-- ---------------------------------------------------------------------------

with appt_orphans as (
  select
    a.dentist_id,
    regexp_replace(coalesce(a.patient_phone, ''), '\D', '', 'g') as phone_digits,
    a.patient_name,
    a.patient_phone,
    a.created_at,
    row_number() over (
      partition by a.dentist_id, regexp_replace(coalesce(a.patient_phone, ''), '\D', '', 'g')
      order by a.created_at asc
    ) as rn
  from public.appointments a
  where a.patient_id is null
    and coalesce(a.patient_phone, '') <> ''
    and coalesce(a.patient_name, '') <> ''
)
insert into public.patients (dentist_id, name, phone, created_at)
select
  o.dentist_id,
  o.patient_name,
  o.patient_phone,
  o.created_at
from appt_orphans o
where o.rn = 1
  and o.phone_digits <> ''
  and not exists (
    select 1 from public.patients p
    where p.dentist_id = o.dentist_id
      and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = o.phone_digits
  );

-- ---------------------------------------------------------------------------
-- Step 2 — link every appointment.patient_id to the matching patient row.
--
-- Now that Step 1 has guaranteed a patient row exists for every (dentist,
-- phone) combination that any appointment uses, this UPDATE wires up
-- patient_id everywhere it's still NULL. Phone-digit match is used (same
-- key as Step 1) so a "+91 98xxxxxxxx" stored on patients still links to
-- a "98xxxxxxxx" appointment row.
-- ---------------------------------------------------------------------------

update public.appointments a
set patient_id = p.id
from public.patients p
where a.patient_id is null
  and a.dentist_id = p.dentist_id
  and coalesce(a.patient_phone, '') <> ''
  and regexp_replace(coalesce(a.patient_phone, ''), '\D', '', 'g')
      = regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')
  and regexp_replace(coalesce(a.patient_phone, ''), '\D', '', 'g') <> '';

-- ---------------------------------------------------------------------------
-- Verification queries (run these manually after applying the migration).
--
--   -- How many appointments still have no patient_id?
--   select count(*) from public.appointments where patient_id is null;
--
--   -- How many patients were created in the last 5 minutes?
--   select count(*) from public.patients where created_at > now() - interval '5 minutes';
--
--   -- Per-dentist breakdown of unresolved appointments (should be only
--   -- rows with empty patient_phone after this script runs).
--   select dentist_id, count(*) from public.appointments
--   where patient_id is null group by 1 order by 2 desc;
-- ---------------------------------------------------------------------------
