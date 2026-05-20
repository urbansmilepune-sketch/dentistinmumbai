// Specialty taxonomy used by the case showcase + the professional profile.
// Slugs are URL-safe (kebab-case) and persisted on cases.specialty. Labels
// are display strings. If a specialty is added here, no DB migration is
// needed — the column is plain text and the filter chips read from this
// list directly.

export interface Specialty {
  slug: string
  label: string
  /** Short colour used by chips + badges (hex). */
  color: string
  bg: string
}

export const SPECIALTIES: Specialty[] = [
  { slug: 'implants',         label: 'Implants',                 color: '#1D4ED8', bg: '#EFF6FF' },
  { slug: 'orthodontics',     label: 'Orthodontics',             color: '#7C3AED', bg: '#F5F3FF' },
  { slug: 'endodontics',      label: 'Endodontics',              color: '#C2410C', bg: '#FFEDD5' },
  { slug: 'cosmetic',         label: 'Cosmetic & Aesthetic',     color: '#EC4899', bg: '#FDF2F8' },
  { slug: 'prosthodontics',   label: 'Prosthodontics',           color: '#0891B2', bg: '#ECFEFF' },
  { slug: 'periodontics',     label: 'Periodontics',             color: '#166534', bg: '#DCFCE7' },
  { slug: 'oral-surgery',     label: 'Oral & Maxillofacial Surgery', color: '#991B1B', bg: '#FEE2E2' },
  { slug: 'pediatric',        label: 'Pediatric Dentistry',      color: '#D97706', bg: '#FEF3C7' },
  { slug: 'general',          label: 'General Dentistry',        color: '#475569', bg: '#F1F5F9' },
  { slug: 'full-mouth',       label: 'Full-Mouth Rehabilitation', color: '#9F1239', bg: '#FFE4E6' },
]

const BY_SLUG: Record<string, Specialty> = Object.fromEntries(SPECIALTIES.map(s => [s.slug, s]))

export function getSpecialty(slug: string | null | undefined): Specialty | null {
  if (!slug) return null
  return BY_SLUG[slug] ?? null
}
