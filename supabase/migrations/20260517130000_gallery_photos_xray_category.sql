-- Add 'xray' to the allowed gallery_photos.category values.
--
-- The Cloudinary upload route (src/app/api/cloudinary/upload/route.ts)
-- routes x-ray uploads from the EMR side into gallery_photos with
-- category='xray'. The existing check constraint only allowed
-- 'interior', 'exterior', 'equipment', 'team', 'before_after', so every
-- x-ray insert was rejected by Postgres with:
--   "new row for relation \"gallery_photos\" violates check constraint
--    \"gallery_photos_category_check\""
--
-- DROP + recreate is the simplest path here. The clinic-gallery uploads
-- (category='interior') were broken by a separate code bug — the route
-- was writing 'clinic_interior' which also failed this check — that's
-- fixed in the same commit by switching to 'interior'.

alter table public.gallery_photos
  drop constraint if exists gallery_photos_category_check;

alter table public.gallery_photos
  add constraint gallery_photos_category_check
  check (category in ('interior', 'exterior', 'equipment', 'team', 'before_after', 'xray'));
