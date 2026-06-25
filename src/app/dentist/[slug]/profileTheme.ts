// Design-system tokens for the rebuilt dentist profile. Kept local to the
// profile route so the page can adopt the navy/teal patient-trust palette
// without disturbing the site-wide --blue tokens used elsewhere.

export const NAVY = '#0F172A'
export const NAVY_SOFT = '#1E293B'
export const TEAL = '#14B8A6'
export const TEAL_DARK = '#0D9488'
export const TEAL_SOFT = '#F0FDFA'
export const WHATSAPP = '#25D366'
export const WHATSAPP_DARK = '#1FB855'

// Gradient used for every "empty but intentional" surface — the cover with
// no photos, the avatar with no profile photo. Navy → teal, left to right.
export const BRAND_GRADIENT = `linear-gradient(135deg, ${NAVY} 0%, ${TEAL_DARK} 100%)`

/** "dr. SWEETY dighade" → "Dr. Sweety Dighade". Strips a baked-in honorific
 *  and title-cases, mirroring DentistCard's normalizeDrName so the same
 *  dentist reads identically on the card and the profile. */
export function normalizeDrName(raw: string | null | undefined): string {
  const bare = String(raw || '').replace(/^\s*dr\b\.?\s*/i, '').trim()
  const titled = bare.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase())
  return titled ? `Dr. ${titled}` : 'Dr.'
}

/** Up to two initials for the avatar fallback. "Sweety Dighade" → "SD". */
export function initialsFrom(raw: string | null | undefined): string {
  const bare = String(raw || '').replace(/^\s*dr\b\.?\s*/i, '').trim()
  const parts = bare.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Dr'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
