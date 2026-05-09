import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/for-dentists/dashboard/',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://www.dentistinmumbai.in/sitemap.xml',
    host: 'https://www.dentistinmumbai.in',
  }
}
