-- Add area_name_raw to dentist_registrations.
--
-- The register form now offers an "Other" option in the area dropdown.
-- When a dentist picks Other, they type a custom area name; that value
-- lands here while `area` is left empty. Keeps the dropdown column
-- ("which curated area did they pick?") separate from the free-text
-- column ("what did they type?") so we can distinguish later — useful
-- for analytics on which neighbourhoods we should be curating next,
-- and for the approval logic which knows that an area_name_raw is a
-- candidate for area auto-creation.
--
-- Nullable + no backfill: every existing registration was made through
-- the dropdown, so area_name_raw is correctly NULL for those rows.

alter table public.dentist_registrations
  add column if not exists area_name_raw text;
