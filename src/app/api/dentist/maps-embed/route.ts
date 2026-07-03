// Resolves whatever a dentist pastes in the "Google Maps Link" field into a
// renderable iframe, then hands it back for the profile save to store.
//
// Why this must be server-side: a mobile share link (maps.app.goo.gl) can only
// be expanded by following its redirect, and the browser can't do that for a
// Maps link (Google blocks framing / cross-origin redirect reads). On the
// server we `fetch(..., { redirect: 'follow' })` and read the resolved URL,
// which carries the clinic's @lat,lng — enough to build a keyless embed.
//
// If GOOGLE_MAPS_EMBED_API_KEY is set we build the canonical Embed API iframe
// (the one form with permissive X-Frame-Options); otherwise we fall back to the
// keyless maps.google.com/maps?q=lat,lng&output=embed form. A full <iframe>
// paste is trusted as-is for backwards compatibility.
import { NextRequest, NextResponse } from 'next/server'
import { getDentistOwner } from '@/lib/dentistSession'
import { classifyMapsInput, buildMapsIframe, extractSearchQuery } from '@/lib/maps'

// SSRF guard: we only ever server-fetch these hosts. A pasted URL on any other
// host is never followed.
const FETCHABLE_HOST_RE = /^(?:maps\.app\.goo\.gl|(?:www\.)?google\.com|maps\.google\.com)$/i
// Modern maps.app.goo.gl links resolve to the `data=` format, which has NO
// @lat,lng — so we extract, in order: coordinates, the CID (feature id) out of
// the `data=…!1s0x…:0x<cid>` blob, then the place name from /maps/place/<NAME>/.
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

// Best embed we can build from a resolved google.com/maps URL, preferring the
// most precise signal available. Returns null if none is present.
function embedFromResolvedUrl(url: string): string | null {
  const ll = url.match(LATLNG_RE)
  if (ll) return embedFromLatLng(ll[1], ll[2])

  // A CID pins the exact business, but the Embed API can't consume a raw CID —
  // only the keyless ?cid=…&output=embed form supports it. So use CID only when
  // there's no API key; with a key we fall through to the place-name embed.
  if (!process.env.GOOGLE_MAPS_EMBED_API_KEY) {
    const cid = url.match(CID_RE)
    if (cid) return iframe(`https://maps.google.com/maps?cid=${BigInt('0x' + cid[1]).toString()}&output=embed&hl=en`)
  }

  const pm = url.match(PLACE_RE)
  if (pm) {
    try {
      const name = decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim()
      if (name) return embedFromPlaceName(name)
    } catch { /* undecodable place segment — fall through */ }
  }
  return null
}

function hostOf(url: string): string | null {
  try { return new URL(url).host } catch { return null }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getDentistOwner()
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const input = typeof body.input === 'string' ? body.input.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const clinicName = typeof body.clinic_name === 'string' ? body.clinic_name : ''

    // Zero-friction path: no pasted link, just a typed clinic name → build a
    // place-name search embed straight from it.
    if (!input) {
      if (name) return NextResponse.json({ maps_embed: embedFromPlaceName(name) })
      return NextResponse.json({ maps_embed: '' })
    }

    // A Google Search results URL (google.com/search?q=…) — the shape dentists
    // most often copy. Use its q= as a place-name search; no fetch needed.
    const searchQ = extractSearchQuery(input)
    if (searchQ) return NextResponse.json({ maps_embed: embedFromPlaceName(searchQ) })

    const kind = classifyMapsInput(input)

    // Power users: a full <iframe> embed is trusted and stored unchanged.
    if (kind === 'iframe') return NextResponse.json({ maps_embed: input })

    if (kind === 'shortLink' || kind === 'searchEmbed') {
      // A full google.com/maps URL may already carry coords/CID/place inline.
      let embed = embedFromResolvedUrl(input)

      // Otherwise follow the link server-side — ONLY for allowlisted hosts —
      // and extract from the resolved URL (short links resolve to /maps/place).
      if (!embed) {
        const host = hostOf(input)
        if (host && FETCHABLE_HOST_RE.test(host)) {
          try {
            const res = await fetch(input, {
              redirect: 'follow',
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DentistInMumbaiBot/1.0)' },
            })
            embed = embedFromResolvedUrl(res.url || '')
          } catch { /* fall through to the fallbacks below */ }
        }
      }

      if (embed) return NextResponse.json({ maps_embed: embed })

      // Nothing extractable: a full Maps URL can still fall back to the clinic
      // name search embed; a short link we couldn't resolve gets a helpful error.
      if (kind === 'searchEmbed') return NextResponse.json({ maps_embed: buildMapsIframe(input, clinicName) })
      return NextResponse.json(
        { error: "We couldn't read that link. Try typing your clinic name in the 'Clinic name on Google Maps' field above instead." },
        { status: 422 },
      )
    }

    // invalid / empty
    return NextResponse.json(
      { error: "We couldn't read that link. Try typing your clinic name in the 'Clinic name on Google Maps' field above instead." },
      { status: 422 },
    )
  } catch {
    return NextResponse.json({ error: 'Could not process the map link.' }, { status: 500 })
  }
}
