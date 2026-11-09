// Profile-completion scoring. Five patient-facing essentials — the SAME
// list the dentist sees in their dashboard sidebar bar, so the admin's
// "incomplete profile" / "avg completion" metrics match the score the
// dentist is being measured against.
//
// Keep this list in sync with src/app/for-dentists/dashboard/layout.tsx.

export interface CompletionFields {
  profile_photo: string | null | undefined
  cover_photo: string | null | undefined
  bio: string | null | undefined
  whatsapp: string | null | undefined
  maps_embed: string | null | undefined
}

export function completionChecks(d: CompletionFields): boolean[] {
  return [
    !!d.profile_photo,
    !!d.cover_photo,
    !!(d.bio && d.bio.length >= 50),
    !!d.whatsapp,
    !!d.maps_embed,
  ]
}

export function completionPct(d: CompletionFields): number {
  const checks = completionChecks(d)
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

// Search index gate for dentist profile pages (and the sitemap, which must
// list exactly the same profiles). 40% = any two of the five essentials.
// It used to be 60%, which kept many real clinics out of Google: a profile
// with its clinic name, area, address, fees and timings already answers a
// patient searching for that dentist by name. Only near-empty profiles stay
// noindexed.
export const INDEXABLE_PROFILE_PCT = 40

export function isIndexableProfile(d: CompletionFields): boolean {
  return completionPct(d) >= INDEXABLE_PROFILE_PCT
}
