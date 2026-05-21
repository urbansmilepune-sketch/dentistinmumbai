-- Unified patient image vault. Replaces two narrower predecessors:
--   - xray_images        (one row per x-ray, no migration file — created
--                         out-of-band earlier in the project's life)
--   - patient_photos     (one row per before/after PAIR — see
--                         20260514160000_patient_photos.sql)
--
-- The new model is one row per image, with image_type discriminating
-- between x-ray modalities (opg, iopa, cbct, periapical, bitewing) and
-- clinical photos (photo_before, photo_after). The before/after PAIR
-- view is reconstructed in the UI by selecting rows of those two types
-- for the same patient/treatment.
--
-- cloudinary_public_id is captured so the app can later support delete /
-- transform operations without storing the API secret on the client.

create table if not exists public.patient_images (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients(id) on delete cascade,
  dentist_id            uuid not null references public.dentists(id) on delete cascade,
  image_url             text not null,
  image_type            text not null,
  tooth_numbers         text,
  notes                 text,
  taken_date            date,
  cloudinary_public_id  text,
  created_at            timestamptz not null default now(),
  constraint patient_images_image_type_check
    check (image_type in ('opg','iopa','cbct','photo_before','photo_after','periapical','bitewing','other'))
);

create index if not exists patient_images_patient_idx on public.patient_images (patient_id, created_at desc);
create index if not exists patient_images_dentist_idx on public.patient_images (dentist_id);
create index if not exists patient_images_type_idx    on public.patient_images (patient_id, image_type);

-- RLS: dentists scope by their own email-on-dentists row, same pattern as
-- patient_photos / consent_forms / perio_charts.
alter table public.patient_images enable row level security;

drop policy if exists "Dentists read their own patient_images" on public.patient_images;
create policy "Dentists read their own patient_images"
  on public.patient_images
  for select
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists insert their own patient_images" on public.patient_images;
create policy "Dentists insert their own patient_images"
  on public.patient_images
  for insert
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists update their own patient_images" on public.patient_images;
create policy "Dentists update their own patient_images"
  on public.patient_images
  for update
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  )
  with check (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Dentists delete their own patient_images" on public.patient_images;
create policy "Dentists delete their own patient_images"
  on public.patient_images
  for delete
  using (
    dentist_id in (select id from public.dentists where email = auth.jwt() ->> 'email')
  );

-- ---------------------------------------------------------------------------
-- Backfill from the two predecessor tables, then drop them. Both backfills
-- are wrapped in DO blocks so the migration is safe to run against a
-- database where one or both predecessor tables never existed (e.g. a
-- freshly-cloned local environment that started after this migration).
--
-- xray_images.image_type → keep recognized values; anything else maps to
-- 'other' so the new CHECK constraint accepts it. The legacy table also
-- has columns `url` (not image_url) and `taken_at` (not taken_date).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'xray_images'
  ) then
    insert into public.patient_images (
      id, patient_id, dentist_id, image_url, image_type, tooth_numbers, taken_date, created_at
    )
    select
      xi.id,
      xi.patient_id,
      xi.dentist_id,
      xi.url,
      case
        when xi.image_type in ('opg','iopa','cbct','periapical','bitewing') then xi.image_type
        else 'other'
      end,
      xi.tooth_number,
      xi.taken_at::date,
      xi.created_at
    from public.xray_images xi
    -- ON CONFLICT just in case the migration is replayed: we keep the
    -- xray_images.id as the patient_images.id so re-runs are idempotent.
    on conflict (id) do nothing;
  end if;
end $$;

-- patient_photos has paired before/after columns — one source row becomes
-- two target rows. created_at on both rows mirrors the source row, so
-- they sort next to each other and the UI can still group them.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'patient_photos'
  ) then
    insert into public.patient_images (
      patient_id, dentist_id, image_url, image_type, notes, taken_date, created_at
    )
    select
      patient_id, dentist_id, before_url, 'photo_before', treatment_label, before_date, created_at
    from public.patient_photos
    where before_url is not null and before_url <> '';

    insert into public.patient_images (
      patient_id, dentist_id, image_url, image_type, notes, taken_date, created_at
    )
    select
      patient_id, dentist_id, after_url, 'photo_after', treatment_label, after_date, created_at
    from public.patient_photos
    where after_url is not null and after_url <> '';
  end if;
end $$;

-- Drop the legacy tables AFTER backfill. IF EXISTS keeps the migration
-- safe to replay or run against environments that never had them.
drop table if exists public.xray_images;
drop table if exists public.patient_photos;
