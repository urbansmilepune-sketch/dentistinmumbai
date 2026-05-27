-- Hard guard against the double-booking race in /api/bookings.
--
-- The booking route does a check-then-insert: it queries for a clash, and
-- if none exists, it inserts. Two concurrent requests can both pass the
-- check and both insert, producing two appointments in the same slot.
-- This index moves the guarantee into Postgres so the loser surfaces as
-- 23505 (unique violation) and the route can convert it to the same 409
-- the application-level check already returns.
--
-- WHERE status != 'cancelled' lets a cancelled appointment free its slot
-- (the existing UX assumption — the clash check filters cancelled out
-- the same way). A re-booking into the freed slot inserts cleanly.
--
-- COALESCE(location_id, '00000000-...') normalises NULL into a sentinel
-- so the index treats "branch unset" as one logical bucket, matching the
-- route's existing behaviour where a NULL location_id triggers a dentist-
-- wide clash check rather than a per-branch one.

create unique index if not exists appointments_slot_unique
  on public.appointments (
    dentist_id,
    appt_date,
    time_slot,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status <> 'cancelled';
