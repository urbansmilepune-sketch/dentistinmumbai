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
// matches "Teeth Cleaning", so it needs no entry). Braces and aligners are NOT
// mapped to each other — they share one treatment page ("Braces & Aligners")
// whose name contains both words, so contains-matching covers them without
// falsely equating two distinct treatments.
const SYNONYMS: Record<string, string> = {
  rct: 'root canal',
  scaling: 'teeth cleaning',
  polishing: 'teeth cleaning',
  cap: 'crown',
  caps: 'crowns',
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
