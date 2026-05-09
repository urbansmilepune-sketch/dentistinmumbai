import { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()
  const BASE = 'https://www.dentistinmumbai.in'

  const [{ data: areas }, { data: dentists }, { data: treatments }] = await Promise.all([
    supabase.from('areas').select('slug, updated_at').eq('is_active', true),
    supabase.from('dentists').select('slug, created_at').eq('is_active', true),
    supabase.from('treatments').select('slug'),
  ])

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE}/dentists`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/for-dentists`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ]

  // Area pages
  const areaPages: MetadataRoute.Sitemap = (areas || []).map(area => ({
    url: `${BASE}/area/${area.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.85,
  }))

  // Area + Treatment pages
  const areaTreatmentPages: MetadataRoute.Sitemap = (areas || []).flatMap(area =>
    (treatments || []).map(treatment => ({
      url: `${BASE}/area/${area.slug}/${treatment.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }))
  )

  // Treatment pages
  const treatmentPages: MetadataRoute.Sitemap = (treatments || []).map(t => ({
    url: `${BASE}/treatment/${t.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Dentist profile pages
  const dentistPages: MetadataRoute.Sitemap = (dentists || []).map(d => ({
    url: `${BASE}/dentist/${d.slug}`,
    lastModified: d.created_at ? new Date(d.created_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [
    ...staticPages,
    ...areaPages,
    ...treatmentPages,
    ...areaTreatmentPages,
    ...dentistPages,
  ]
}
