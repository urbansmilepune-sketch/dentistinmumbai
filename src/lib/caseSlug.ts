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

export function caseSlug(c: { id: string; title?: string | null; city?: string | null }): string {
  let base = words(c.title || '')
  const city = words(c.city || '')
  if (city && !`-${base}-`.includes(`-${city}-`)) base = base ? `${base}-${city}` : city
  // Keep the words part short enough for a tidy link; cut on a word break.
  if (base.length > 70) {
    base = base.slice(0, 70)
    const cut = base.lastIndexOf('-')
    if (cut > 30) base = base.slice(0, cut)
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
