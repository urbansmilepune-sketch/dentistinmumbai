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
