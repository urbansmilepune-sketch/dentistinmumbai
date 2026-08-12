-- Repairs the consent_templates language columns to match what is actually
-- live. Applied via the Supabase SQL editor on 2026-08-12 and verified against
-- the live database the same day (CLI not linked to this project — migrations
-- here are replayable records; see project memory).
--
-- ── History, because the two earlier migrations do NOT describe live state ──
--
-- 20260620140000_consent_templates_marathi.sql and
-- 20260620150000_consent_templates_more_languages.sql were written as records
-- of SQL that was never actually run. Neither the columns nor the 30 seeded
-- translation rows ever reached the database, so consent-template creation
-- failed for months with:
--
--   PGRST204  Could not find the 'language' column of 'consent_templates'
--
-- A first repair attempt added `language` with DEFAULT 'english' — a value
-- outside the 'en' | 'mr' | 'hi' | 'gu' | 'te' | 'ta' | 'both' set the UI reads
-- and writes. That unblocked nothing: the create path also selects
-- template_group on its RETURNING clause, so it kept failing with 42703, and
-- every existing row now held a language code no badge or language-picker
-- could resolve. This migration is the corrective pass.
--
-- ── Divergences from 20260620140000 / 20260620150000 that REMAIN ──
--
--   1. NO CHECK constraint on `language`. The statement was supplied but did
--      not take effect — verified on 2026-08-12 by inserting
--      language = 'zz_not_a_lang', which was accepted (201). The column is
--      free text. Application code compensates: normLang() in
--      dashboard/consent-forms/templates/page.tsx folds any unrecognised value
--      back to 'en' rather than crashing the render. To add the constraint
--      later, run the block at the bottom of this file — the data is already
--      clean, so it should apply as-is.
--
--   2. The 30 Marathi / Hindi / Gujarati / Telugu / Tamil system templates from
--      those two migrations were never inserted and are still absent. Only the
--      7 original English system templates exist (basal_implant is bilingual
--      and flagged 'both'). Running those INSERT blocks is still outstanding;
--      they have no conflict guard, so run them exactly once.

alter table public.consent_templates
  add column if not exists language text,
  add column if not exists template_group text;

-- Correct the default that arrived with the first repair attempt. The UI
-- writes two-letter codes; 'english' was never a value it could read back.
alter table public.consent_templates
  alter column language set default 'en';

-- Normalise existing rows onto the code set the UI understands.
update public.consent_templates
set language = 'en'
where language is null
   or language not in ('en', 'mr', 'hi', 'gu', 'te', 'ta', 'both');

-- Group the system templates so the en + translated versions of one form
-- collapse into a single entry in the picker. Custom rows keep a NULL group
-- and fall back to form_type.
update public.consent_templates
set template_group = form_type
where is_system = true and template_group is null;

-- The basal_implant template ships English and Marathi in one document.
update public.consent_templates
set language = 'both'
where is_system = true and form_type = 'basal_implant';

-- ---------------------------------------------------------------------------
-- NOT APPLIED — the language CHECK constraint.
-- Left commented rather than deleted so the intended shape isn't lost. The
-- UPDATE above already guarantees every row satisfies it, so this should
-- apply cleanly whenever it's run.
-- ---------------------------------------------------------------------------
-- alter table public.consent_templates
--   drop constraint if exists consent_templates_language_check;
--
-- alter table public.consent_templates
--   add constraint consent_templates_language_check
--   check (language in ('en','mr','hi','gu','te','ta','both'));
