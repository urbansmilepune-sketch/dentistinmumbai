import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityByDomain, cityOrigin, CITY_CONFIGS, isNationalHost, NATIONAL_ORIGIN } from '@/config/cities'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')

  // National parent. The sitemap surfaces the network homepage + /cities,
  // and lists every city domain as a dofollow link so Google crawls the
  // city sites through the parent. Per-city sitemaps still live at each
  // city domain's own /sitemap.xml — this is just the discovery layer.
  if (isNationalHost(host)) {
    const now = new Date()
    const nationalPages: MetadataRoute.Sitemap = [
      { url: NATIONAL_ORIGIN,                lastModified: now, changeFrequency: 'daily',  priority: 1.0 },
      { url: `${NATIONAL_ORIGIN}/cities`,    lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    ]
    const cityHomes: MetadataRoute.Sitemap = Object.values(CITY_CONFIGS).map(c => ({
      url: `https://${c.domain}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }))
    return [...nationalPages, ...cityHomes]
  }

  const supabase = await createClient()
  const city = getCityByDomain(host)
  const BASE = cityOrigin(city)

  // Each city's sitemap lists only its own areas + dentists. Dentist profile
  // pages use a city-scoped query so we don't leak Mumbai dentists into the
  // Pune sitemap (or vice versa).
  const [{ data: areas }, { data: dentists }, { data: treatments }] = await Promise.all([
    supabase.from('areas').select('slug, updated_at').eq('is_active', true).eq('city', city.citySlug),
    supabase.from('dentists').select('slug, created_at').eq('is_active', true).eq('city', city.citySlug),
    supabase.from('treatments').select('slug'),
  ])

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE}/dentists`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/for-dentists`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ]

  const areaPages: MetadataRoute.Sitemap = (areas || []).map(area => ({
    url: `${BASE}/area/${area.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.85,
  }))

  const areaTreatmentPages: MetadataRoute.Sitemap = (areas || []).flatMap(area =>
    (treatments || []).map(treatment => ({
      url: `${BASE}/area/${area.slug}/${treatment.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }))
  )

  const treatmentPages: MetadataRoute.Sitemap = (treatments || []).map(t => ({
    url: `${BASE}/treatment/${t.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const dentistPages: MetadataRoute.Sitemap = (dentists || []).map(d => ({
    url: `${BASE}/dentist/${d.slug}`,
    lastModified: d.created_at ? new Date(d.created_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const bookingPages: MetadataRoute.Sitemap = (dentists || []).map(d => ({
    url: `${BASE}/book/${d.slug}`,
    lastModified: d.created_at ? new Date(d.created_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))

  return [
    ...staticPages,
    ...areaPages,
    ...treatmentPages,
    ...areaTreatmentPages,
    ...dentistPages,
    ...bookingPages,
  ]
}
