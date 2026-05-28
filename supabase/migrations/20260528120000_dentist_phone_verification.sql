-- Dentist phone verification — column on dentists + OTP storage table.
--
-- The dashboard's profile editor surfaces a "Verify Mobile" section that
-- texts a 6-digit OTP (via MSG91) to the dentist's listed phone and
-- flips `dentists.phone_verified = true` on a successful match.
--
-- We deliberately do NOT reuse public.review_otps for this — that table
-- is keyed on `phone` for the patient-side review flow, and a patient
-- whose own phone happens to match a dentist's would otherwise collide on
-- the upsert. Separate table, dentist_id-keyed, no overlap.

alter table public.dentists
  add column if not exists phone_verified boolean default false;

create table if not exists public.dentist_phone_otps (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid not null unique references public.dentists(id) on delete cascade,
  -- Snapshot the phone at OTP-issue time so the verify path can refuse
  -- a code that was issued before the dentist edited their phone number.
  phone text not null,
  otp text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

create index if not exists dentist_phone_otps_dentist_id_idx on public.dentist_phone_otps (dentist_id);
create index if not exists dentist_phone_otps_expires_at_idx on public.dentist_phone_otps (expires_at);

-- Editing the listed phone invalidates the verification: the new number
-- has never been challenged with an OTP, so phone_verified=true would
-- become a stale claim. Reset the flag in the same UPDATE that changes
-- the phone so the dentist has to re-run the OTP flow. We trigger
-- BEFORE UPDATE so the row landing in the table already has the
-- corrected flag — no second UPDATE round-trip.
create or replace function public.reset_phone_verified_on_phone_change()
returns trigger
language plpgsql
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists dentists_reset_phone_verified on public.dentists;
create trigger dentists_reset_phone_verified
  before update of phone on public.dentists
  for each row
  execute function public.reset_phone_verified_on_phone_change();
