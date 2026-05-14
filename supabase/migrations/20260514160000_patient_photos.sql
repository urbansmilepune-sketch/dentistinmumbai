-- Before/after photo pairs for a patient. Each row is one comparison —
-- treatment_label is what the patient was treated for, before/after URLs
-- point at Cloudinary uploads. Dates are stored separately from created_at
-- because the photos may have been taken before this row was inserted.

create table if not exists public.patient_photos (
  id              uuid primary key default gen_random_uuid(),
  dentist_id      uuid not null references public.dentists(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  treatment_label text,
  before_url      text not null,
  before_date     date,
  after_url       text not null,
  after_date      date,
  created_at      timestamptz not null default now()
);

create index if not exists patient_photos_patient_idx on public.patient_photos (patient_id);
create index if not exists patient_photos_dentist_idx on public.patient_photos (dentist_id);

-- RLS: same email-on-dentists pattern as the rest of the schema. Delete is
-- included because dentists will want to remove botched uploads.
alter table public.patient_photos enable row level security;

drop policy if exists "Dentists read their own patient photos" on public.patient_photos;
create policy "Dentists read their own patient photos"
  on public.patient_photos
  for select
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

drop policy if exists "Dentists insert their own patient photos" on public.patient_photos;
create policy "Dentists insert their own patient photos"
  on public.patient_photos
  for insert
  with check (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );

drop policy if exists "Dentists delete their own patient photos" on public.patient_photos;
create policy "Dentists delete their own patient photos"
  on public.patient_photos
  for delete
  using (
    dentist_id in (
      select id from public.dentists where email = auth.jwt() ->> 'email'
    )
  );
