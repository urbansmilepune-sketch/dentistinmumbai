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
          // Public pages under the otherwise-disallowed /for-dentists/ tree.
          // Longer than the '/for-dentists/' disallow below, so longest-match
          // precedence keeps them crawlable. Login and forgot-password are
          // linked from the header on every page and carry a noindex tag;
          // Google can only see that tag if it may fetch the page. While they
          // were blocked, GSC reported them as "Indexed, though blocked by
          // robots.txt".
          '/for-dentists/register',
          '/for-dentists/login',
          '/for-dentists/forgot-password',
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
          // Patient portal pages behind login. Trailing slash on purpose: the
          // /patient login page itself is linked from the header ("Patient
          // Login") and carries a noindex tag, so it must stay fetchable for
          // Google to drop it (same reason as /login and /book below).
          '/patient/',
          // /login and /book are deliberately NOT disallowed. /login 308s to
          // /for-dentists/login and every /book page carries a noindex tag,
          // but Google can only see a redirect or noindex on a page it is
          // allowed to fetch. While they were blocked here, GSC kept /book and
          // /login in the index ("Indexed, though blocked by robots.txt").
          '/api/',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
