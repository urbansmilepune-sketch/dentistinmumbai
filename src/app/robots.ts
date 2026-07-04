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
        allow: '/',
        disallow: [
          '/admin/',
          '/for-dentists/dashboard/',
          '/for-dentists/login',
          '/for-dentists/register',
          '/book/',
          '/api/',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
