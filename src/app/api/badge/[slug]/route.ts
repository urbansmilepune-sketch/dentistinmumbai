// Embeddable "Featured on DentistIn<City>" SVG badge for dentists to place on
// their own clinic websites. Served as image/svg+xml so a plain <img src> on
// any external site renders it, cached for an hour at the browser and CDN.
//
// City is taken from the dentist's own row (authoritative), so a Pune dentist's
// badge reads "DentistInPune.in" and a Mumbai dentist's reads "DentistInMumbai.in".
// When the slug isn't found we still return a valid generic badge (never a 404)
// so a stale embed degrades to a plain brand mark instead of a broken image.
import { NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCityBySlug, getCityByDomain, cityBrandName, cityBrandTld, type CityConfig } from '@/config/cities'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const NAVY = '#0F172A'
const TEAL = '#14B8A6'
const SLATE = '#94A3B8'
const WHITE = '#FFFFFF'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Teal disc with a white tick — the "verified" mark, drawn to the right of the
// wordmark and vertically centred.
function verifiedMark(cx: number, cy: number, r: number): string {
  const d = `M ${cx - r * 0.42} ${cy + r * 0.02} l ${r * 0.28} ${r * 0.34} l ${r * 0.6} ${-r * 0.66}`
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TEAL}" stroke="${WHITE}" stroke-width="1.5"/>` +
    `<path d="${d}" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  )
}

function badgeSvg(brand: string, verified: boolean, small: boolean, ariaLabel: string): string {
  const b = esc(brand)
  const aria = esc(ariaLabel)
  const FONT = 'Arial, Helvetica, sans-serif'

  if (small) {
    const w = 120, h = 40
    const brandLen = verified ? 68 : 82
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">` +
      `<rect width="${w}" height="${h}" rx="8" fill="${NAVY}"/>` +
      `<rect x="7" y="11" width="18" height="18" rx="5" fill="${TEAL}"/>` +
      `<text x="16" y="24.5" font-family="${FONT}" font-size="12" font-weight="800" fill="${NAVY}" text-anchor="middle">D</text>` +
      `<text x="30" y="24.5" font-family="${FONT}" font-size="9" font-weight="700" fill="${WHITE}" textLength="${brandLen}" lengthAdjust="spacingAndGlyphs">${b}</text>` +
      (verified ? verifiedMark(110, 20, 6) : '') +
      `</svg>`
    )
  }

  const w = 200, h = 60
  const brandLen = verified ? 116 : 132
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">` +
    `<rect width="${w}" height="${h}" rx="10" fill="${NAVY}"/>` +
    `<rect x="12" y="15" width="30" height="30" rx="8" fill="${TEAL}"/>` +
    `<text x="27" y="37" font-family="${FONT}" font-size="18" font-weight="800" fill="${NAVY}" text-anchor="middle">D</text>` +
    `<text x="52" y="27" font-family="${FONT}" font-size="8" font-weight="700" letter-spacing="1.5" fill="${SLATE}">FEATURED ON</text>` +
    `<text x="52" y="44" font-family="${FONT}" font-size="13" font-weight="700" fill="${WHITE}" textLength="${brandLen}" lengthAdjust="spacingAndGlyphs">${b}</text>` +
    (verified ? verifiedMark(184, 30, 9) : '') +
    `</svg>`
  )
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const small = new URL(request.url).searchParams.get('size') === 'small'

  let verified = false
  let name: string | null = null
  let city: CityConfig
  try {
    const { data } = await admin
      .from('dentists')
      .select('name, is_verified, city')
      .eq('slug', slug)
      .maybeSingle()
    if (data) {
      verified = !!data.is_verified
      name = data.name ?? null
      city = getCityBySlug(data.city)
    } else {
      // Unknown slug → generic badge branded to the request's city domain.
      city = getCityByDomain(request.headers.get('x-forwarded-host') || request.headers.get('host'))
    }
  } catch {
    city = getCityByDomain(request.headers.get('x-forwarded-host') || request.headers.get('host'))
  }

  const brand = `${cityBrandName(city)}${cityBrandTld(city)}`
  const ariaLabel = name ? `${name} — Featured on ${brand}` : `Featured on ${brand}`
  const svg = badgeSvg(brand, verified, small, ariaLabel)

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // 1 hour at browser + CDN; serve-stale for a day while revalidating.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
