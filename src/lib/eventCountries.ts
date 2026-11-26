// Countries offered on the Add event form for international listings, in
// the order Indian dentists travel to most. Anything else can be typed.
export const INDIA = 'India'

export const COUNTRIES = [
  'United Arab Emirates', 'Germany', 'United States', 'United Kingdom', 'Singapore', 'Thailand',
  'Italy', 'Spain', 'France', 'Switzerland', 'Netherlands', 'Austria', 'Sweden', 'Turkey',
  'Saudi Arabia', 'Qatar', 'Malaysia', 'Indonesia', 'Sri Lanka', 'Nepal', 'Bangladesh',
  'Japan', 'South Korea', 'China', 'Australia', 'Canada', 'Brazil', 'Mexico', 'South Africa', 'Egypt',
]

const ALIASES: Record<string, string> = {
  uae: 'United Arab Emirates', 'u.a.e.': 'United Arab Emirates', dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  usa: 'United States', us: 'United States', 'u.s.a.': 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', england: 'United Kingdom', 'great britain': 'United Kingdom',
  korea: 'South Korea', 'republic of korea': 'South Korea', bharat: INDIA,
}

/** Tidy a country name; null/empty means India. */
export function normalizeCountry(v: unknown): string {
  if (typeof v !== 'string') return INDIA
  const t = v.trim().replace(/\s+/g, ' ')
  if (!t) return INDIA
  const k = t.toLowerCase()
  if (k === 'india') return INDIA
  if (ALIASES[k]) return ALIASES[k]
  const known = COUNTRIES.find(c => c.toLowerCase() === k)
  return known || t.slice(0, 60)
}

export function isInternational(e: { country?: string | null }): boolean {
  return !!e.country && e.country !== INDIA
}

/** "Dubai, United Arab Emirates" / "Pune" / "Online". */
export function placeLabel(e: { is_online?: boolean; city?: string | null; country?: string | null }, cityName: (c: string | null) => string | null): string {
  if (e.is_online) return 'Online'
  if (isInternational(e)) return [e.city, e.country].filter(Boolean).join(', ')
  return cityName(e.city ?? null) || e.city || 'India'
}
