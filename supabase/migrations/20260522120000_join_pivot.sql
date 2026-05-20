-- Schema deltas for the LinkedIn-style /join flow on dentistinindia.in.
-- The strategic pivot is "frictionless professional network" — a new
-- dentist joining via /join becomes live immediately on both the
-- national directory and their city site, without waiting for an admin
-- approval cycle. To keep the existing admin moderation surfaces
-- (Registrations tab, ref_no, etc.) intact, the join route still writes
-- a dentist_registrations row alongside the dentists row.
--
-- Three new columns on dentist_registrations to capture the extra
-- LinkedIn-shaped fields the /join form collects. All nullable so the
-- existing city /for-dentists/register endpoint keeps working without
-- modification.
--
-- specialization      — single-choice dropdown (General Dentist,
--                       Orthodontist, Implantologist, etc.)
-- linkedin_url        — optional URL the dentist enters during join
-- experience_years    — same name + type as dentists.experience_years
--                       so admin promotion of a registration → dentist
--                       row can copy this column 1:1

alter table public.dentist_registrations
  add column if not exists specialization     text;
alter table public.dentist_registrations
  add column if not exists linkedin_url       text;
alter table public.dentist_registrations
  add column if not exists experience_years   int;

-- Matching column on dentists in case the existing column is named
-- differently or absent. dentists.experience_years already exists from
-- the original schema — this guard makes the join flow safe to run
-- against an older snapshot of the dentists table without bombing on
-- a missing column.
alter table public.dentists
  add column if not exists linkedin_url       text;
