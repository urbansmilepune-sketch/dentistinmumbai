-- Clinic branding for the dentist profile. The dentist uploads a square
-- clinic logo and a digital signature in the dashboard (Branding section);
-- both are stored as Cloudinary secure_urls and rendered on the generated
-- invoice and prescription PDFs (logo top-left/right, signature in the
-- prescription footer above the doctor's name). The *_updated_at columns
-- let us bust any future delivery cache and show "last updated" in the UI.
--
-- All columns nullable so existing rows keep working — every PDF generator
-- checks for a non-empty url before embedding the image.

alter table public.dentists
  add column if not exists clinic_logo_url text,
  add column if not exists signature_url text,
  add column if not exists logo_updated_at timestamptz,
  add column if not exists signature_updated_at timestamptz;
