import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getCityByDomain, cityOrigin } from '@/config/cities'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers()
  const city = getCityByDomain(h.get('x-forwarded-host') || h.get('host'))
  const origin = cityOrigin(city)
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
