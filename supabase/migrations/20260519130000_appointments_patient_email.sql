-- Patient email captured at booking time. Optional — the public booking
-- form asks for it but doesn't require it, so historic rows and rows from
-- patients who skipped the field stay NULL. The /api/bookings route, the
-- patient acknowledgement email, and the on-confirmation email all check
-- for NULL before they try to send.
alter table public.appointments
  add column if not exists patient_email text;
