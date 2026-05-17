// Normalises whatever a dentist pastes into the "Google Maps" field on the
// dashboard into a renderable iframe.
//
// Accepted inputs:
//   1. Full <iframe …> embed HTML (Google Maps → Share → Embed a map).
//   2. Any Google Maps URL — share.google, maps.app.goo.gl, goo.gl/maps,
//      google.com/maps, maps.google.com. We cannot expand short URLs from
//      the browser, so we fall back to a generic search-embed pointed at
//      the clinic name. Not exactly the same pin the dentist picked, but
//      good enough for "show patients where the clinic is".
//   3. Empty / anything else → empty string (renderers should skip the
//      whole map block).
//
// The output is a plain HTML string and is fed to dangerouslySetInnerHTML
// on the public profile, so do not let arbitrary HTML through here.

const GOOGLE_MAPS_URL_RE = /^https?:\/\/(?:share\.google|goo\.gl\/maps|maps\.app\.goo\.gl|(?:www\.)?google\.com\/maps|maps\.google\.com)/i

const IFRAME_WRAPPER_RE = /^<iframe[\s\S]*<\/iframe>\s*$/i

export function buildMapsIframe(value: string | null | undefined, clinicName: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  if (IFRAME_WRAPPER_RE.test(raw)) return raw
  if (GOOGLE_MAPS_URL_RE.test(raw)) {
    const q = encodeURIComponent((clinicName ?? '').trim() || 'Dental Clinic')
    return `<iframe src="https://maps.google.com/maps?q=${q}&output=embed" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
  }
  return ''
}

// Pulls the src attribute out of the iframe form for cases where we want
// to render the iframe ourselves (e.g. React with explicit attributes
// instead of dangerouslySetInnerHTML). Returns null if the input is not an
// iframe or the src is not a Google Maps URL.
export function extractMapsIframeSrc(iframeHtml: string | null | undefined): string | null {
  const html = (iframeHtml ?? '').trim()
  if (!html) return null
  const m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  if (!m) return null
  const src = m[1]
  if (!/^https:\/\/(?:www\.)?google\.com\/maps\/embed/i.test(src)
    && !/^https:\/\/maps\.google\.com\/maps\?/i.test(src)) return null
  return src
}
