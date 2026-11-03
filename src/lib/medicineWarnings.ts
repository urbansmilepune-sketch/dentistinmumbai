// Simple word-match rules for the patient safety card. Not AI: a fixed list
// of generic and common Indian brand names, matched as whole words.

const BLOOD_THINNERS = [
  'aspirin', 'ecosprin', 'disprin', 'loprin', 'clopidogrel', 'clopilet', 'plavix', 'deplatt',
  'warfarin', 'acitrom', 'acenocoumarol', 'sintrom', 'rivaroxaban', 'xarelto', 'apixaban',
  'eliquis', 'dabigatran', 'pradaxa', 'ticagrelor', 'brilinta', 'prasugrel', 'heparin',
  'enoxaparin', 'cilostazol', 'dipyridamole',
]
const BLOOD_THINNER_RE = new RegExp(`\\b(${BLOOD_THINNERS.join('|')})`, 'i')

// The first blood thinner named in a "current medications" text, or null.
export function findBloodThinner(medications: unknown): string | null {
  const m = String(medications || '').match(BLOOD_THINNER_RE)
  return m ? m[1] : null
}

// What a free-text health field holds: nothing, an explicit "none", or a value.
const NONE_RE = /^(none|nil|no|na|n\/a|nkda|nkma|not known|no known( drug)? allerg(y|ies)|no allerg(y|ies)|no medicines?|-)\.?$/i
export type Recorded = 'blank' | 'none' | 'value'
export function recordedState(text: unknown): Recorded {
  const t = String(text ?? '').trim()
  if (!t) return 'blank'
  return NONE_RE.test(t) ? 'none' : 'value'
}
