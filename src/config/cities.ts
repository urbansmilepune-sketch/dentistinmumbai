export type CitySlug =
  | 'mumbai'
  | 'navimumbai'
  | 'pune'
  | 'thane'
  | 'nashik'
  | 'nagpur'
  | 'kolhapur'
  | 'goa'
  | 'surat'
  | 'sambhajinagar'
  | 'rajkot'
  | 'ahmedabad'
  | 'jamnagar'

export interface CityConfig {
  cityName: string
  citySlug: CitySlug
  domain: string
  heroTitle: string
  heroSubtitle: string
  metaTitle: string
  /** Path to the city's nav-bar logo under `/public`. All cities currently
   *  share `/logo.png`; swap individual entries here when per-city assets land. */
  logoPath: string
  /** Indian state/UT the city belongs to. Used for the /cities page state
   *  grouping and the national-map tooltip. */
  state: string
  /** Decimal-degree centroid used to project the dot onto the India SVG
   *  on the national homepage map. */
  lat: number
  lng: number
}

export const CITY_CONFIGS: Record<CitySlug, CityConfig> = {
  mumbai:        { cityName: 'Mumbai',         citySlug: 'mumbai',        domain: 'dentistinmumbai.in',         heroTitle: 'Find the Best Dentist in Mumbai',         heroSubtitle: 'Verified dentists across all Mumbai areas', metaTitle: 'Find Dentists in Mumbai | dentistinmumbai.in',                 logoPath: '/logo-mumbai.png',         state: 'Maharashtra',  lat: 19.0760, lng: 72.8777 },
  navimumbai:    { cityName: 'Navi Mumbai',    citySlug: 'navimumbai',    domain: 'dentistinnavimumbai.in',     heroTitle: 'Find the Best Dentist in Navi Mumbai',    heroSubtitle: 'Verified dentists across Navi Mumbai',      metaTitle: 'Find Dentists in Navi Mumbai | dentistinnavimumbai.in',         logoPath: '/logo-navimumbai.png',     state: 'Maharashtra',  lat: 19.0330, lng: 73.0297 },
  pune:          { cityName: 'Pune',           citySlug: 'pune',          domain: 'dentistinpune.in',           heroTitle: 'Find the Best Dentist in Pune',           heroSubtitle: 'Verified dentists across all Pune areas',   metaTitle: 'Find Dentists in Pune | dentistinpune.in',                     logoPath: '/logo-pune.png',           state: 'Maharashtra',  lat: 18.5204, lng: 73.8567 },
  thane:         { cityName: 'Thane',          citySlug: 'thane',         domain: 'dentistinthane.com',         heroTitle: 'Find the Best Dentist in Thane',          heroSubtitle: 'Verified dentists across Thane',            metaTitle: 'Find Dentists in Thane | dentistinthane.com',                  logoPath: '/logo-thane.png',          state: 'Maharashtra',  lat: 19.2183, lng: 72.9781 },
  nashik:        { cityName: 'Nashik',         citySlug: 'nashik',        domain: 'dentistinnashik.com',        heroTitle: 'Find the Best Dentist in Nashik',         heroSubtitle: 'Verified dentists across Nashik',           metaTitle: 'Find Dentists in Nashik | dentistinnashik.com',                logoPath: '/logo-nashik.png',         state: 'Maharashtra',  lat: 19.9975, lng: 73.7898 },
  nagpur:        { cityName: 'Nagpur',         citySlug: 'nagpur',        domain: 'dentistinnagpur.in',         heroTitle: 'Find the Best Dentist in Nagpur',         heroSubtitle: 'Verified dentists across Nagpur',           metaTitle: 'Find Dentists in Nagpur | dentistinnagpur.in',                 logoPath: '/logo-nagpur.png',         state: 'Maharashtra',  lat: 21.1458, lng: 79.0882 },
  kolhapur:      { cityName: 'Kolhapur',       citySlug: 'kolhapur',      domain: 'dentistinkolhapur.in',       heroTitle: 'Find the Best Dentist in Kolhapur',       heroSubtitle: 'Verified dentists across Kolhapur',         metaTitle: 'Find Dentists in Kolhapur | dentistinkolhapur.in',             logoPath: '/logo-kolhapur.png',       state: 'Maharashtra',  lat: 16.7050, lng: 74.2433 },
  goa:           { cityName: 'Goa',            citySlug: 'goa',           domain: 'dentistingoa.in',            heroTitle: 'Find the Best Dentist in Goa',            heroSubtitle: 'Verified dentists across Goa',              metaTitle: 'Find Dentists in Goa | dentistingoa.in',                       logoPath: '/logo-goa.png',            state: 'Goa',          lat: 15.4909, lng: 73.8278 },
  surat:         { cityName: 'Surat',          citySlug: 'surat',         domain: 'dentistinsurat.com',         heroTitle: 'Find the Best Dentist in Surat',          heroSubtitle: 'Verified dentists across Surat',            metaTitle: 'Find Dentists in Surat | dentistinsurat.com',                  logoPath: '/logo-surat.png',          state: 'Gujarat',      lat: 21.1702, lng: 72.8311 },
  sambhajinagar: { cityName: 'Sambhajinagar',  citySlug: 'sambhajinagar', domain: 'dentistinsambhajinagar.com', heroTitle: 'Find the Best Dentist in Sambhajinagar',  heroSubtitle: 'Verified dentists across Sambhajinagar',    metaTitle: 'Find Dentists in Sambhajinagar | dentistinsambhajinagar.com',  logoPath: '/logo-sambhajinagar.png',  state: 'Maharashtra',  lat: 19.8762, lng: 75.3433 },
  rajkot:        { cityName: 'Rajkot',         citySlug: 'rajkot',        domain: 'dentistinrajkot.in',         heroTitle: 'Find the Best Dentist in Rajkot',         heroSubtitle: 'Verified dentists across Rajkot',           metaTitle: 'Find Dentists in Rajkot | dentistinrajkot.in',                 logoPath: '/logo-rajkot.png',         state: 'Gujarat',      lat: 22.3039, lng: 70.8022 },
  ahmedabad:     { cityName: 'Ahmedabad',      citySlug: 'ahmedabad',     domain: 'dentistinahmedabad.com',     heroTitle: 'Find the Best Dentist in Ahmedabad',      heroSubtitle: 'Verified dentists across Ahmedabad',        metaTitle: 'Find Dentists in Ahmedabad | dentistinahmedabad.com',          logoPath: '/logo-ahmedabad.png',      state: 'Gujarat',      lat: 23.0225, lng: 72.5714 },
  jamnagar:      { cityName: 'Jamnagar',       citySlug: 'jamnagar',      domain: 'dentistinjamnagar.in',       heroTitle: 'Find the Best Dentist in Jamnagar',       heroSubtitle: 'Verified dentists across Jamnagar',         metaTitle: 'Find Dentists in Jamnagar | dentistinjamnagar.in',             logoPath: '/logo.png',                state: 'Gujarat',      lat: 22.4707, lng: 70.0577 },
}

export const DEFAULT_CITY: CitySlug = 'mumbai'

export const CITY_BY_DOMAIN: Record<string, CityConfig> = Object.fromEntries(
  Object.values(CITY_CONFIGS).map(c => [c.domain, c])
)

export function getCityByDomain(host: string | null | undefined): CityConfig {
  if (!host) return CITY_CONFIGS[DEFAULT_CITY]
  const cleaned = host.toLowerCase().replace(/^www\./, '').split(':')[0]
  return CITY_BY_DOMAIN[cleaned] || CITY_CONFIGS[DEFAULT_CITY]
}

// ── National parent site ─────────────────────────────────────────────────
// dentistinindia.in is the parent of every city domain. It's deliberately
// NOT a CitySlug — there's no city named "national" — so it lives outside
// CITY_CONFIGS and is detected via this helper. Proxy.ts checks isNationalHost
// first; when true it sets `x-is-national: 1` and pages branch on that,
// falling through to the regular city resolution otherwise.

export const NATIONAL_HOST = 'dentistinindia.in'
export const NATIONAL_ORIGIN = `https://${NATIONAL_HOST}`

export function isNationalHost(host: string | null | undefined): boolean {
  if (!host) return false
  const cleaned = host.toLowerCase().replace(/^www\./, '').split(':')[0]
  return cleaned === NATIONAL_HOST
}

export function getCityBySlug(slug: string | null | undefined): CityConfig {
  if (!slug) return CITY_CONFIGS[DEFAULT_CITY]
  return CITY_CONFIGS[slug as CitySlug] || CITY_CONFIGS[DEFAULT_CITY]
}

/**
 * Brand chunk that goes before the TLD — e.g. 'DentistInMumbai',
 * 'DentistInNaviMumbai', 'DentistInPune'. Matches what the existing JSX
 * rendered before multi-city: 'DentistIn' + city name with spaces removed.
 */
export function cityBrandName(city: CityConfig): string {
  return `DentistIn${city.cityName.replace(/\s+/g, '')}`
}

/**
 * The TLD portion of the brand, with the leading dot — e.g. '.in' or '.com'.
 * Pairs with cityBrandName to compose the visible domain.
 */
export function cityBrandTld(city: CityConfig): string {
  const parts = city.domain.split('.')
  return '.' + parts.slice(1).join('.')
}

/**
 * Canonical https origin for the city — e.g. 'https://dentistinpune.in'.
 */
export function cityOrigin(city: CityConfig): string {
  return `https://${city.domain}`
}
