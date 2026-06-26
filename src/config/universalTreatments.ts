// The "universal" treatments seeded to every dentist — procedures essentially
// any general dentist performs. Specialist treatments (implants, braces,
// aligners, veneers, smile-makeover, etc.) are deliberately NOT seeded: not
// every clinic offers them, and false listings erode patient trust.
//
// Single source of truth for the app (consumed by the shared seed helper in
// src/lib/seedTreatments.ts, used by approval + both instant-on signup routes).
// The backfill script scripts/seed-universal-treatments.mjs hardcodes the same
// six slugs (a .mjs can't import TS without a loader) — KEEP THE TWO IN SYNC.
export const UNIVERSAL_TREATMENT_SLUGS = [
  'teeth-cleaning',
  'root-canal',
  'tooth-extraction',
  'dental-crowns',
  'teeth-whitening',
  'tooth-fillings',
] as const
