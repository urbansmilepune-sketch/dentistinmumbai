import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityByDomain, cityOrigin, CITY_CONFIGS, isNationalHost, NATIONAL_ORIGIN } from '@/config/cities'
import { getAreaCompleteDentistCounts, getAreaTreatmentCompleteCounts } from '@/lib/cache/public-pages'
import { completionPct } from '@/lib/profileCompletion'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const supabase = await createClient()

  // National parent. The sitemap surfaces the network homepage + /cities,
  // and lists every city domain as a dofollow link so Google crawls the
  // city sites through the parent. Per-city sitemaps still live at each
  // city domain's own /sitemap.xml — this is just the discovery layer.
  if (isNationalHost(host)) {
    const now = new Date()
    const nationalPages: MetadataRoute.Sitemap = [
      { url: NATIONAL_ORIGIN,                       lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
      { url: `${NATIONAL_ORIGIN}/cities`,           lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
      { url: `${NATIONAL_ORIGIN}/cases`,            lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
      { url: `${NATIONAL_ORIGIN}/dental-tourism`,   lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
      { url: `${NATIONAL_ORIGIN}/for-dentists`,     lastModified: now, changeFrequency: 'weekly',  priority: 0.85 },
      { url: `${NATIONAL_ORIGIN}/about`,            lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ]
    const cityHomes: MetadataRoute.Sitemap = Object.values(CITY_CONFIGS).map(c => ({
      url: `https://${c.domain}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }))
    // Approved case + professional-profile URLs — fetched via the
    // user-bound client; case_photos RLS doesn't gate the cases.id read.
    const [{ data: approvedCases }, { data: activeDentists }] = await Promise.all([
      supabase.from('cases').select('id, created_at').eq('status', 'approved').order('created_at', { ascending: false }).limit(5000),
      supabase.from('dentists').select('slug').eq('is_active', true).limit(5000),
    ])
    const casePages: MetadataRoute.Sitemap = (approvedCases || []).map((c: any) => ({
      url: `${NATIONAL_ORIGIN}/cases/${c.id}`,
      lastModified: c.created_at ? new Date(c.created_at) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }))
    const profilePages: MetadataRoute.Sitemap = (activeDentists || []).map((d: any) => ({
      url: `${NATIONAL_ORIGIN}/professional/${d.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
    return [...nationalPages, ...cityHomes, ...casePages, ...profilePages]
  }

  const city = getCityByDomain(host)
  const BASE = cityOrigin(city)

  // Each city's sitemap lists only its own areas + dentists. Dentist profile
  // pages use a city-scoped query so we don't leak Mumbai dentists into the
  // Pune sitemap (or vice versa).
  //
  // Density gate (Section 1 + 3): the sitemap must NEVER advertise a URL that
  // the route would notFound() or noindex. It emits an area / area×treatment
  // URL only when it clears the SAME ≥3-complete-profile bar the page uses
  // (shared helpers, so route and sitemap can't drift), and a dentist profile
  // only when it's ≥60% complete. Area×treatment is queried dynamically from
  // live counts — never statically enumerated.
  const [{ data: areas, error: areasErr }, { data: dentists }, { data: treatments }, areaCompleteCounts, atCompleteCounts] = await Promise.all([
    // No updated_at / created_at column on `areas` — selecting one 42703s, and
    // PostgREST returns data: null for the whole query, which silently emptied
    // BOTH areaPages and areaTreatmentPages from every city sitemap. Select
    // only columns that exist and let lastModified fall back to now.
    supabase.from('areas').select('id, slug').eq('is_active', true).eq('city', city.citySlug),
    supabase
      .from('dentists')
      .select('slug, created_at, profile_photo, cover_photo, bio, whatsapp, maps_embed')
      .eq('is_active', true)
      .eq('city', city.citySlug),
    supabase.from('treatments').select('id, slug'),
    getAreaCompleteDentistCounts(city.citySlug),
    getAreaTreatmentCompleteCounts(city.citySlug),
  ])

  // A failed areas read drops the entire programmatic layer from the sitemap
  // while every other section still renders, so it looks like a healthy
  // sitemap. Make it loud rather than letting it fail open again.
  if (areasErr) {
    console.error('[sitemap] areas query failed — area and area×treatment URLs omitted', areasErr)
  }

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE}/dentists`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/for-dentists`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ]

  // Only areas with ≥3 complete-profile dentists (the indexable tier). Ones
  // that 404 (0 active) or noindex (1–2 complete) are omitted. lastmod is the
  // area's real updated_at.
  const areaPages: MetadataRoute.Sitemap = (areas || [])
    .filter(area => (areaCompleteCounts[String(area.id)] ?? 0) >= 3)
    .map(area => ({
      url: `${BASE}/area/${area.slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.85,
    }))

  // Dynamic, not a static matrix: emit an area×treatment URL only when ≥3
  // complete-profile dentists in that area offer that treatment — the exact
  // rule the route indexes under.
  const areaTreatmentPages: MetadataRoute.Sitemap = (areas || []).flatMap(area =>
    (treatments || [])
      .filter(t => (atCompleteCounts[`${area.id}:${t.id}`] ?? 0) >= 3)
      .map(t => ({
        url: `${BASE}/area/${area.slug}/${t.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.75,
      }))
  )

  // Treatment hubs are flagship pages — always listed so the crawler finds
  // them (Section 2). No updated_at column on treatments, so lastmod stays now.
  const treatmentPages: MetadataRoute.Sitemap = (treatments || []).map(t => ({
    url: `${BASE}/treatment/${t.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Only profiles ≥60% complete — matches the noindex gate on the profile
  // route so we never advertise a noindexed profile. lastmod is created_at
  // (dentists has no updated_at column yet; a maintained updated_at would give
  // a truer freshness signal — noted as a follow-up).
  const dentistPages: MetadataRoute.Sitemap = (dentists || [])
    .filter(d => completionPct({
      profile_photo: (d as any).profile_photo,
      cover_photo: (d as any).cover_photo,
      bio: (d as any).bio,
      whatsapp: (d as any).whatsapp,
      maps_embed: (d as any).maps_embed,
    }) >= 60)
    .map(d => ({
      url: `${BASE}/dentist/${d.slug}`,
      lastModified: d.created_at ? new Date(d.created_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))

  // Cluster landing pages — currently just Pune's Pimpri-Chinchwad (PCMC)
  // umbrella at /pcmc, which only exists on the Pune domain.
  const clusterPages: MetadataRoute.Sitemap = city.citySlug === 'pune'
    ? [{ url: `${BASE}/pcmc`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.85 }]
    : []

  // Booking pages (/book/[slug]) are intentionally excluded: they're
  // transactional forms with no unique SEO content, and listing them just
  // wastes crawl budget. They're also Disallowed in robots.ts.
  return [
    ...staticPages,
    ...clusterPages,
    ...areaPages,
    ...treatmentPages,
    ...areaTreatmentPages,
    ...dentistPages,
  ]
}
