import type { CitySlug } from './cities'

// Hand-curated "popular searches" surfaced on each city homepage just
// below the cross-city link block. Pure SEO play — these H3 links
// strengthen keyword density for long-tail "dentist in <area>" and
// "<treatment> <city>" queries that map onto our /area/<slug> and
// /treatment/<slug> routes.
//
// hrefs are relative paths — the link resolves on whichever city
// host this renders on, so the city context comes from the URL the
// crawler is already on rather than from the anchor.
//
// Only cities with a non-empty array render the section; partial
// coverage is fine while we research what queries each city actually
// gets traffic on.

export interface PopularSearch {
  text: string
  href: string
}

export const CITY_POPULAR_SEARCHES: Partial<Record<CitySlug, PopularSearch[]>> = {
  mumbai: [
    { text: 'Dentist in Bandra',      href: '/area/bandra' },
    { text: 'Dentist in Andheri',     href: '/area/andheri' },
    { text: 'Dentist in Powai',       href: '/area/powai' },
    { text: 'Dentist in Juhu',        href: '/area/juhu' },
    { text: 'Dental implants Mumbai', href: '/treatment/dental-implants' },
    { text: 'Orthodontist Mumbai',    href: '/treatment/braces-aligners' },
    { text: 'Root canal Mumbai',      href: '/treatment/root-canal' },
  ],
  pune: [
    { text: 'Dentist in Wakad',       href: '/area/wakad' },
    { text: 'Dentist in Baner',       href: '/area/baner' },
    { text: 'Dentist in Kothrud',     href: '/area/kothrud' },
    { text: 'Dentist in Hinjewadi',   href: '/area/hinjewadi' },
    { text: 'Dental implants Pune',   href: '/treatment/dental-implants' },
    { text: 'Orthodontist Pune',      href: '/treatment/braces-aligners' },
  ],
}
