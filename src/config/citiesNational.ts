// Coming-soon cities for the national parent site (dentistinindia.in).
//
// These are the top 50 Indian cities NOT yet live on the platform, picked
// to (a) cover the largest unrepresented metros and (b) place at least one
// dot in every Indian state + major UT so the national map reads as a
// nationwide presence rather than a Western-India product. Coordinates are
// city-centre lat/lng (decimal degrees) used to project each dot onto the
// SVG of India on the homepage and to seed the /cities page state grouping.
//
// Slugs MUST be kebab-case + URL-safe — they're persisted in the
// `city_waitlist` table to route launch notifications. Once a city goes
// live, remove its entry here and add it to CITY_CONFIGS.

import { OPENING_CITY_CONFIGS } from '@/config/cities'

export interface ComingSoonCity {
  slug: string
  name: string
  state: string
  lat: number
  lng: number
}

const NOT_YET_OPEN: ComingSoonCity[] = [
  // Tier-1 metros (not already live)
  { slug: 'delhi',            name: 'Delhi',            state: 'Delhi',                lat: 28.6139, lng: 77.2090 },
  { slug: 'hyderabad',        name: 'Hyderabad',        state: 'Telangana',            lat: 17.3850, lng: 78.4867 },

  // Tier-2 / large state capitals
  { slug: 'jaipur',           name: 'Jaipur',           state: 'Rajasthan',            lat: 26.9124, lng: 75.7873 },
  { slug: 'lucknow',          name: 'Lucknow',          state: 'Uttar Pradesh',        lat: 26.8467, lng: 80.9462 },
  { slug: 'kanpur',           name: 'Kanpur',           state: 'Uttar Pradesh',        lat: 26.4499, lng: 80.3319 },
  { slug: 'ludhiana',         name: 'Ludhiana',         state: 'Punjab',               lat: 30.9010, lng: 75.8573 },
  { slug: 'prayagraj',        name: 'Prayagraj',        state: 'Uttar Pradesh',        lat: 25.4358, lng: 81.8463 },
  { slug: 'dhanbad',          name: 'Dhanbad',          state: 'Jharkhand',            lat: 23.7957, lng: 86.4304 },
  { slug: 'solapur',          name: 'Solapur',          state: 'Maharashtra',          lat: 17.6599, lng: 75.9064 },
  { slug: 'jodhpur',          name: 'Jodhpur',          state: 'Rajasthan',            lat: 26.2389, lng: 73.0243 },
  { slug: 'salem',            name: 'Salem',            state: 'Tamil Nadu',           lat: 11.6643, lng: 78.1460 },

  // Smaller state capitals — included so every Indian state has at least
  // one pin on the national map, even where dental volume is modest.
  { slug: 'gangtok',          name: 'Gangtok',          state: 'Sikkim',               lat: 27.3389, lng: 88.6065 },
  { slug: 'imphal',           name: 'Imphal',           state: 'Manipur',              lat: 24.8170, lng: 93.9368 },
  { slug: 'shillong',         name: 'Shillong',         state: 'Meghalaya',            lat: 25.5788, lng: 91.8933 },
  { slug: 'itanagar',         name: 'Itanagar',         state: 'Arunachal Pradesh',    lat: 27.0844, lng: 93.6053 },
  { slug: 'kohima',           name: 'Kohima',           state: 'Nagaland',             lat: 25.6701, lng: 94.1077 },
  { slug: 'aizawl',           name: 'Aizawl',           state: 'Mizoram',              lat: 23.7271, lng: 92.7176 },
  { slug: 'agartala',         name: 'Agartala',         state: 'Tripura',              lat: 23.8315, lng: 91.2868 },

  // Kerala + South coverage
  { slug: 'puducherry',       name: 'Puducherry',       state: 'Puducherry',           lat: 11.9416, lng: 79.8083 },
]

// Opening cities (CITY_CONFIGS entries flagged `opening`) have their own
// domain and sign-up page but too few dentists to count as live, so the
// national site keeps showing them as coming soon.
export const COMING_SOON_CITIES: ComingSoonCity[] = [
  ...OPENING_CITY_CONFIGS.map(c => ({ slug: c.citySlug, name: c.cityName, state: c.state, lat: c.lat, lng: c.lng })),
  ...NOT_YET_OPEN,
]
