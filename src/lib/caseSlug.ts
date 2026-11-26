// Readable case URLs: /cases/<words-from-title>-<city>-<first 8 of id>,
// e.g. /cases/root-canal-lower-molar-pune-a1bab95a.
//
// The slug is worked out from the title and the author's city every time,
// never stored, so no SQL is needed and an edited title simply gets a new
// URL (the page sends the old one on with a permanent redirect). The last
// 8 hex characters are the start of the case UUID and are what the page
// actually looks the case up by; the words are only for people and Google.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_LEN = 8

export function isCaseUuid(s: string): boolean {
  return UUID_RE.test(s)
}

function words(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Words part is kept to about 50 characters so the whole slug, with the
// 9-character "-<id>" ending, stays near 60. The title is cut on a word
// break first, then the city is added, so the city is never cut off.
const MAX_WORDS_LEN = 50

function cutOnWord(s: string, max: number): string {
  if (s.length <= max) return s
  const head = s.slice(0, max + 1)
  const cut = head.lastIndexOf('-')
  let out = (cut > 0 ? head.slice(0, cut) : s.slice(0, max)).replace(/-+$/, '')
  // Don't end on a filler word ("...-change-the").
  while (/-(the|a|an|of|and|or|to|in|on|for|with|by|is|can|its|this|that)$/.test(out)) out = out.replace(/-[a-z]+$/, '')
  return out
}

export function caseSlug(c: { id: string; title?: string | null; city?: string | null }): string {
  let base = words(c.title || '')
  const city = words(c.city || '')
  const cityInTitle = !!city && `-${base}-`.includes(`-${city}-`)
  if (city && !cityInTitle) {
    base = cutOnWord(base, Math.max(MAX_WORDS_LEN - city.length - 1, 20))
    base = base ? `${base}-${city}` : city
  } else {
    base = cutOnWord(base, MAX_WORDS_LEN)
  }
  const short = c.id.replace(/-/g, '').slice(0, SHORT_ID_LEN).toLowerCase()
  return base ? `${base}-${short}` : `case-${short}`
}

export function casePath(c: { id: string; title?: string | null; city?: string | null }): string {
  return `/cases/${caseSlug(c)}`
}

/** The id prefix at the end of a slug, or null if the segment isn't one. */
export function shortIdFromSlug(slug: string): string | null {
  const m = /(?:^|-)([0-9a-f]{8})$/i.exec(slug)
  return m ? m[1].toLowerCase() : null
}

/** UUID range covering every id that starts with this 8-hex prefix. */
export function uuidRangeForShortId(short: string): { from: string; to: string } {
  return {
    from: `${short}-0000-0000-0000-000000000000`,
    to: `${short}-ffff-ffff-ffff-ffffffffffff`,
  }
}
