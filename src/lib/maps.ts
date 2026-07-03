// Normalises whatever a dentist pastes into the "Google Maps" field on the
// dashboard into a renderable iframe — and classifies the input so the
// dashboard can warn for shapes we can't render (short links).
//
// Why this is messy: Google has tightened X-Frame-Options on every Maps
// host except the canonical `/maps/embed?pb=…` URL served by their
// "Share → Embed a map" flow. The legacy `?output=embed` trick used to
// work but now redirects to www.google.com/ which sets
// `X-Frame-Options: sameorigin` and the iframe fails to render.
//
// Input handling:
//   1. <iframe src="…/maps/embed?pb=…"> embed HTML  → trust, render as-is.
//   2. Short URL (share.google, goo.gl/maps, maps.app.goo.gl) → we cannot
//      expand them client-side and Google blocks following redirects from
//      an iframe, so we return EMPTY and let the dashboard warn the user.
//   3. Full google.com/maps URL with /maps/place/<NAME>/@… → extract the
//      place segment and build a best-effort `?q=…&output=embed` iframe.
//      May still 302 → blocked on some browsers; that's why we ask for an
//      iframe in step 1.
//   4. Empty / anything else → empty string (caller skips the map block).
//
// `buildMapsIframe` returns an HTML string that gets fed to
// dangerouslySetInnerHTML on the public profile, so no arbitrary HTML
// passes through here — only iframes whose src we recognise.

const SHORT_MAPS_URL_RE = /^https?:\/\/(?:share\.google|goo\.gl\/maps|maps\.app\.goo\.gl)\b/i
const FULL_MAPS_URL_RE  = /^https?:\/\/(?:(?:www\.)?google\.com\/maps|maps\.google\.com\b)/i
const IFRAME_WRAPPER_RE = /^<iframe[\s\S]*<\/iframe>\s*$/i

// The one Google embed URL with permissive X-Frame-Options. Anything else
// — including the older maps.google.com/maps?q=… form — may render in
// some browsers and fail in others.
const TRUSTED_EMBED_RE = /^https:\/\/(?:www\.)?google\.com\/maps\/embed\?/i

// Every embed src we actually render: the canonical /maps/embed?pb= form, the
// Embed API /maps/embed/v1/… form, and the keyless maps.google.com/maps?…
// (output=embed) form that buildMapsIframe and the maps-embed route generate.
// An iframe carrying any of these is one of ours, so classify it as 'iframe',
// not 'invalid'. (Public-profile rendering already trusts any google.com/maps
// iframe; this regex only governs the dashboard's preview/warning UI.)
const RENDERABLE_EMBED_SRC_RE = /^https:\/\/(?:(?:www\.)?google\.com\/maps\/embed(?:\/v1\/[a-z]+)?\?|maps\.google\.com\/maps\?)/i

export type MapsInputKind = 'iframe' | 'searchEmbed' | 'shortLink' | 'empty' | 'invalid'

/** Classifies the raw input so the dashboard can pick the right UI:
 *  render the preview, show a "short links don't embed" warning, or flag
 *  an unrecognised paste. */
export function classifyMapsInput(value: string | null | undefined): MapsInputKind {
  const raw = (value ?? '').trim()
  if (!raw) return 'empty'
  if (IFRAME_WRAPPER_RE.test(raw)) {
    const src = pullIframeSrcFromHtml(raw)
    if (src && RENDERABLE_EMBED_SRC_RE.test(src)) return 'iframe'
    // An iframe whose src isn't a Google Maps embed we recognise — something
    // the dentist hand-rolled or a non-Maps host. Treat as invalid so we
    // don't blindly trust unknown HTML.
    return 'invalid'
  }
  if (SHORT_MAPS_URL_RE.test(raw)) return 'shortLink'
  if (FULL_MAPS_URL_RE.test(raw)) return 'searchEmbed'
  // A Google Search results URL (google.com/search?q=…) — dentists commonly
  // copy this instead of a Maps link. We can turn its q= into a place search.
  if (extractSearchQuery(raw)) return 'searchEmbed'
  return 'invalid'
}

function pullIframeSrcFromHtml(html: string): string | null {
  const m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : null
}

/** Pulls the q= term out of a google.com/search?q=… URL. Returns null for any
 *  other host/path, so it never fires on a Maps URL that happens to have q=. */
export function extractSearchQuery(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/(?:^|\.)google\.com$/i.test(u.host)) return null
    if (!u.pathname.startsWith('/search')) return null
    const q = u.searchParams.get('q')?.trim()
    return q || null
  } catch {
    return null
  }
}

/** Tries to read the place name out of a `/maps/place/<NAME>/@…` URL. */
function extractPlaceFromUrl(url: string): string | null {
  const m = url.match(/\/maps\/place\/([^/?@]+)/i)
  if (!m) return null
  try {
    const decoded = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim()
    return decoded || null
  } catch {
    return null
  }
}

export function buildMapsIframe(value: string | null | undefined, clinicName: string | null | undefined): string {
  const raw = (value ?? '').trim()
  const kind = classifyMapsInput(raw)
  if (kind === 'iframe') return raw
  if (kind === 'searchEmbed') {
    // Best-effort fallback: pull the place name from the URL when present,
    // otherwise the clinic name the dentist has typed. This URL may itself
    // 302 → blocked in some browsers, which is why the dashboard hints at
    // the iframe-embed flow.
    const placeFromUrl = extractPlaceFromUrl(raw) ?? extractSearchQuery(raw)
    const term = (placeFromUrl ?? clinicName ?? '').trim() || 'Dental Clinic'
    const q = encodeURIComponent(term)
    return `<iframe src="https://maps.google.com/maps?q=${q}&output=embed&hl=en" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
  }
  // shortLink / invalid / empty — we don't fabricate an iframe, so the
  // map block on the public profile stays hidden until the dentist
  // pastes something we can actually embed.
  return ''
}

// A renderable Google embed src carries a `pb` parameter — the long
// `!1m…`-delimited blob Google generates in the "Embed a map" flow. When
// that blob is missing, empty, or truncated, Google's embed responds with
// "Google Maps Platform rejected your request … Invalid 'pb' parameter"
// *inside* the iframe. We can't read that cross-origin error, so we detect
// the malformed pb up front and let the dashboard show a friendly hint
// instead of leaving Google's raw error page on screen. The search-embed
// form (maps.google.com/maps?q=…) has no pb and isn't affected.
export function hasValidEmbedPb(src: string | null | undefined): boolean {
  const s = (src ?? '').trim()
  if (!s) return false
  if (!TRUSTED_EMBED_RE.test(s)) return true
  const m = s.match(/[?&]pb=([^&]*)/i)
  if (!m) return false
  let pb: string
  try { pb = decodeURIComponent(m[1]) } catch { pb = m[1] }
  return pb.startsWith('!1m')
}

// Pulls the src attribute out of the iframe form for cases where we want
// to render the iframe ourselves (e.g. React with explicit attributes
// instead of dangerouslySetInnerHTML). Returns null if the input is not an
// iframe or the src is not a Google Maps URL we recognise.
export function extractMapsIframeSrc(iframeHtml: string | null | undefined): string | null {
  const html = (iframeHtml ?? '').trim()
  if (!html) return null
  const src = pullIframeSrcFromHtml(html)
  if (!src) return null
  if (!TRUSTED_EMBED_RE.test(src)
    && !/^https:\/\/maps\.google\.com\/maps\?/i.test(src)) return null
  return src
}
