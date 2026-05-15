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
}

export const CITY_CONFIGS: Record<CitySlug, CityConfig> = {
  mumbai:        { cityName: 'Mumbai',         citySlug: 'mumbai',        domain: 'dentistinmumbai.in',         heroTitle: 'Find the Best Dentist in Mumbai',         heroSubtitle: 'Verified dentists across all Mumbai areas', metaTitle: 'Find Dentists in Mumbai | dentistinmumbai.in' },
  navimumbai:    { cityName: 'Navi Mumbai',    citySlug: 'navimumbai',    domain: 'dentistinnavimumbai.in',     heroTitle: 'Find the Best Dentist in Navi Mumbai',    heroSubtitle: 'Verified dentists across Navi Mumbai',      metaTitle: 'Find Dentists in Navi Mumbai | dentistinnavimumbai.in' },
  pune:          { cityName: 'Pune',           citySlug: 'pune',          domain: 'dentistinpune.in',           heroTitle: 'Find the Best Dentist in Pune',           heroSubtitle: 'Verified dentists across all Pune areas',   metaTitle: 'Find Dentists in Pune | dentistinpune.in' },
  thane:         { cityName: 'Thane',          citySlug: 'thane',         domain: 'dentistinthane.com',         heroTitle: 'Find the Best Dentist in Thane',          heroSubtitle: 'Verified dentists across Thane',            metaTitle: 'Find Dentists in Thane | dentistinthane.com' },
  nashik:        { cityName: 'Nashik',         citySlug: 'nashik',        domain: 'dentistinnashik.com',        heroTitle: 'Find the Best Dentist in Nashik',         heroSubtitle: 'Verified dentists across Nashik',           metaTitle: 'Find Dentists in Nashik | dentistinnashik.com' },
  nagpur:        { cityName: 'Nagpur',         citySlug: 'nagpur',        domain: 'dentistinnagpur.in',         heroTitle: 'Find the Best Dentist in Nagpur',         heroSubtitle: 'Verified dentists across Nagpur',           metaTitle: 'Find Dentists in Nagpur | dentistinnagpur.in' },
  kolhapur:      { cityName: 'Kolhapur',       citySlug: 'kolhapur',      domain: 'dentistinkolhapur.in',       heroTitle: 'Find the Best Dentist in Kolhapur',       heroSubtitle: 'Verified dentists across Kolhapur',         metaTitle: 'Find Dentists in Kolhapur | dentistinkolhapur.in' },
  goa:           { cityName: 'Goa',            citySlug: 'goa',           domain: 'dentistingoa.in',            heroTitle: 'Find the Best Dentist in Goa',            heroSubtitle: 'Verified dentists across Goa',              metaTitle: 'Find Dentists in Goa | dentistingoa.in' },
  surat:         { cityName: 'Surat',          citySlug: 'surat',         domain: 'dentistinsurat.com',         heroTitle: 'Find the Best Dentist in Surat',          heroSubtitle: 'Verified dentists across Surat',            metaTitle: 'Find Dentists in Surat | dentistinsurat.com' },
  sambhajinagar: { cityName: 'Sambhajinagar',  citySlug: 'sambhajinagar', domain: 'dentistinsambhajinagar.com', heroTitle: 'Find the Best Dentist in Sambhajinagar',  heroSubtitle: 'Verified dentists across Sambhajinagar',    metaTitle: 'Find Dentists in Sambhajinagar | dentistinsambhajinagar.com' },
  rajkot:        { cityName: 'Rajkot',         citySlug: 'rajkot',        domain: 'dentistinrajkot.in',         heroTitle: 'Find the Best Dentist in Rajkot',         heroSubtitle: 'Verified dentists across Rajkot',           metaTitle: 'Find Dentists in Rajkot | dentistinrajkot.in' },
  ahmedabad:     { cityName: 'Ahmedabad',      citySlug: 'ahmedabad',     domain: 'dentistinahmedabad.com',     heroTitle: 'Find the Best Dentist in Ahmedabad',      heroSubtitle: 'Verified dentists across Ahmedabad',        metaTitle: 'Find Dentists in Ahmedabad | dentistinahmedabad.com' },
  jamnagar:      { cityName: 'Jamnagar',       citySlug: 'jamnagar',      domain: 'dentistinjamnagar.in',       heroTitle: 'Find the Best Dentist in Jamnagar',       heroSubtitle: 'Verified dentists across Jamnagar',         metaTitle: 'Find Dentists in Jamnagar | dentistinjamnagar.in' },
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
