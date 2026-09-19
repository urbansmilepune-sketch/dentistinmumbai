import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getCityByDomain, cityOrigin, isNationalHost, NATIONAL_ORIGIN } from '@/config/cities'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  // The national parent has no CitySlug, so getCityByDomain falls back to
  // Mumbai for it. Resolving the origin through that fallback made
  // dentistinindia.in/robots.txt advertise Mumbai's sitemap and declare
  // `Host: dentistinmumbai.in` — pointing crawlers at the wrong property.
  // Branch on the host first, exactly like sitemap.ts already does.
  const origin = isNationalHost(host) ? NATIONAL_ORIGIN : cityOrigin(getCityByDomain(host))
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          // The one public funnel page under the otherwise-disallowed
          // /for-dentists/ tree. Longer than the '/for-dentists/' disallow
          // below, so longest-match precedence keeps it crawlable. Login is
          // deliberately NOT re-allowed — it's a sign-in form with no search
          // value, and the disallow below covers it.
          '/for-dentists/register',
        ],
        disallow: [
          // No trailing slash so it also catches the /admin index route;
          // '/admin/' kept for the subtree.
          '/admin',
          '/admin/',
          // Whole authed dashboard tree — register/login re-allowed above.
          // '/for-dentists/dashboard/' kept from before (now redundant).
          '/for-dentists/',
          '/for-dentists/dashboard/',
          // Patient portal — private, never indexable. No trailing slash so
          // it covers both /patient and /patient/*.
          '/patient',
          '/login',
          // Prefix (no trailing slash) so it covers both /book and /book/*
          // — nothing under /book should ever be crawled or indexed.
          '/book',
          '/api/',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
