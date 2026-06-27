// Query normalization for the /search page. Patients type natural phrases
// ("root canal treatment", "teeth cleaning near me", "implant cost in <city>")
// but the data holds canonical names ("Root Canal", "Teeth Cleaning", "Dental
// Implants"). Literal matching misses all of these, so we normalize first:
// lowercase, strip filler words and the "in <city>" suffix, then expand a small
// synonym map. City-aware so it works across all 14 domains — never hardcodes a
// city.

const FILLER_WORDS = [
  'near me', 'nearby', // multi-word first so they're stripped as phrases
  'treatment', 'treatments', 'cost', 'costs', 'price', 'prices',
  'best', 'top', 'good', 'cheap', 'affordable',
  'doctor', 'doctors', 'specialist', 'specialists', 'clinic', 'clinics',
]

// token → canonical phrase. Deliberately minimal: only words that do NOT already
// appear as a substring of the target treatment name (e.g. "cleaning" already
// matches "Teeth Cleaning", so it needs no entry). NOTE: "braces" and "aligners"
// are deliberately ABSENT here — they must never rewrite to each other (they are
// distinct treatments). They route to their shared page via TREATMENT_SLUG_ALIASES
// below, NOT through this synonym rewrite.
const SYNONYMS: Record<string, string> = {
  rct: 'root canal',
  scaling: 'teeth cleaning',
  polishing: 'teeth cleaning',
  cap: 'crown',
  caps: 'crowns',
}

// Query token → treatment SLUG. Routes a search term straight to the correct
// /treatment/<slug> page even when the term is not a substring of the
// treatment's display name. "braces" and "aligners" both live on the single
// "Braces & Aligners" page (slug braces-aligners): each routes there
// independently, but they are NOT synonyms of each other (see SYNONYMS above —
// we never rewrite one to the other). Keys are normalized tokens (lowercase,
// post-filler). City-agnostic — slugs are identical across all 14 domains.
export const TREATMENT_SLUG_ALIASES: Record<string, string> = {
  braces: 'braces-aligners',
  aligner: 'braces-aligners',
  aligners: 'braces-aligners',
}

// Treatment slugs a normalized query routes to via the alias map, checked
// token-by-token. Empty when no token aliases. The search page unions these
// with its name-contains matches so aliased terms always surface the right card.
export function aliasedTreatmentSlugs(normalizedQuery: string): string[] {
  if (!normalizedQuery) return []
  const slugs = new Set<string>()
  for (const tok of normalizedQuery.split(/\s+/)) {
    const slug = TREATMENT_SLUG_ALIASES[tok]
    if (slug) slugs.add(slug)
  }
  return [...slugs]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeSearchQuery(raw: string, cityName: string): string {
  let s = ` ${raw.toLowerCase().trim()} `
  // Strip "in <city>" (e.g. "root canal in mumbai"), city-aware for every domain.
  s = s.replace(new RegExp(`\\bin ${escapeRegExp(cityName.toLowerCase())}\\b`, 'g'), ' ')
  // Strip filler words/phrases.
  for (const f of FILLER_WORDS) {
    s = s.replace(new RegExp(`\\b${escapeRegExp(f)}\\b`, 'g'), ' ')
  }
  // Collapse whitespace and expand single-word synonyms.
  const tokens = s.split(/\s+/).filter(Boolean).map(t => SYNONYMS[t] ?? t)
  return tokens.join(' ').trim()
}

// Does `name` match the normalized query? Phrase-contains in either direction,
// plus single-token contains for one-word queries — so "implant" hits "Dental
// Implants" while "teeth cleaning" does NOT cross-match "Teeth Whitening".
export function nameMatchesQuery(name: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return false
  const n = name.toLowerCase()
  if (n.includes(normalizedQuery) || normalizedQuery.includes(n)) return true
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 1 && tokens[0].length >= 3) return n.includes(tokens[0])
  return false
}
