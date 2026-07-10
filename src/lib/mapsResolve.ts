// Server-side Google-Maps input resolver, shared by the admin edit route.
//
// This mirrors the normalisation the dentist-side /api/dentist/maps-embed
// route performs, but is factored out as a pure function that takes the
// input + optional names and RETURNS the resolved embed (plus any coords it
// could extract) instead of writing them to a session-bound dentist row.
// That lets the admin route normalise on behalf of an arbitrary dentist and
// persist the result itself.
//
// Keep the embed-building logic here in sync with the dentist route — both
// aim to produce the one Google embed form with permissive X-Frame-Options
// (or the keyless output=embed fallback when no Embed API key is set).
import { classifyMapsInput, buildMapsIframe, extractSearchQuery } from '@/lib/maps'

const FETCHABLE_HOST_RE = /^(?:share\.google|maps\.app\.goo\.gl|(?:www\.)?google\.com|maps\.google\.com)$/i
const LATLNG_RE = /@(-?\d+\.\d+),(-?\d+\.\d+)/
const CID_RE = /!1s0x[0-9a-f]+:0x([0-9a-f]+)/i
const PLACE_RE = /\/maps\/place\/([^/?@]+)/i

function iframe(src: string): string {
  return `<iframe src="${src}" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
}

function embedFromLatLng(lat: string, lng: string): string {
  const key = process.env.GOOGLE_MAPS_EMBED_API_KEY
  if (key) return iframe(`https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${lat},${lng}&zoom=16`)
  return iframe(`https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed&hl=en`)
}

function embedFromPlaceName(name: string): string {
  const key = process.env.GOOGLE_MAPS_EMBED_API_KEY
  const q = encodeURIComponent(name)
  if (key) return iframe(`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${q}`)
  return iframe(`https://maps.google.com/maps?q=${q}&output=embed&hl=en`)
}

type ResolvedEmbed = { embed: string; lat?: number; lng?: number }

function embedFromResolvedUrl(url: string): ResolvedEmbed | null {
  const ll = url.match(LATLNG_RE)
  if (ll) return { embed: embedFromLatLng(ll[1], ll[2]), lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) }

  if (!process.env.GOOGLE_MAPS_EMBED_API_KEY) {
    const cid = url.match(CID_RE)
    if (cid) return { embed: iframe(`https://maps.google.com/maps?cid=${BigInt('0x' + cid[1]).toString()}&output=embed&hl=en`) }
  }

  const pm = url.match(PLACE_RE)
  if (pm) {
    try {
      const name = decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim()
      if (name) return { embed: embedFromPlaceName(name) }
    } catch { /* undecodable place segment — fall through */ }
  }
  return null
}

function hostOf(url: string): string | null {
  try { return new URL(url).host } catch { return null }
}

export type MapsResolveResult =
  | { ok: true; maps_embed: string; lat?: number; lng?: number }
  | { ok: false; error: string }

/** Resolves a pasted Maps link / iframe / clinic name into a renderable embed.
 *  Pure + idempotent: an already-normalised iframe or an empty string returns
 *  unchanged without any network call, so re-saving an unchanged profile is a
 *  no-op. Only short/full Maps URLs trigger a server-side redirect follow. */
export async function resolveMapsEmbed(
  input: string,
  name: string,
  clinicName: string,
): Promise<MapsResolveResult> {
  const trimmed = (input || '').trim()

  // Empty input: fall back to a clinic-name search embed if a name is present,
  // else clear the field.
  if (!trimmed) {
    if (name) return { ok: true, maps_embed: embedFromPlaceName(name) }
    return { ok: true, maps_embed: '' }
  }

  const searchQ = extractSearchQuery(trimmed)
  if (searchQ) return { ok: true, maps_embed: embedFromPlaceName(searchQ) }

  const kind = classifyMapsInput(trimmed)

  // A full <iframe> embed is trusted and stored unchanged — this is also the
  // path a re-saved, already-normalised value takes, so no fetch fires.
  if (kind === 'iframe') return { ok: true, maps_embed: trimmed }

  if (kind === 'shortLink' || kind === 'searchEmbed') {
    let resolved = embedFromResolvedUrl(trimmed)
    if (!resolved) {
      const host = hostOf(trimmed)
      if (host && FETCHABLE_HOST_RE.test(host)) {
        try {
          const res = await fetch(trimmed, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DentistInMumbaiBot/1.0)' },
          })
          resolved = embedFromResolvedUrl(res.url || '')
        } catch { /* fall through to fallbacks */ }
      }
    }
    if (resolved) {
      const out: MapsResolveResult = { ok: true, maps_embed: resolved.embed }
      if (typeof resolved.lat === 'number' && Number.isFinite(resolved.lat)
        && typeof resolved.lng === 'number' && Number.isFinite(resolved.lng)) {
        out.lat = resolved.lat
        out.lng = resolved.lng
      }
      return out
    }
    // A full Maps URL still degrades to a clinic-name search embed.
    if (kind === 'searchEmbed') return { ok: true, maps_embed: buildMapsIframe(trimmed, clinicName) }
    return { ok: false, error: "We couldn't read that map link. Paste a full Google Maps URL or an embed <iframe>, or leave it blank." }
  }

  return { ok: false, error: "We couldn't read that map link. Paste a full Google Maps URL or an embed <iframe>, or leave it blank." }
}
