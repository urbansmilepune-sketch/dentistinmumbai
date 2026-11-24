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
  | 'bangalore'
  | 'mysore'
  | 'mangalore'
  | 'agra'
  | 'amritsar'
  | 'bhopal'
  | 'bhubaneswar'
  | 'bilaspur'
  | 'chandigarh'
  | 'chennai'
  | 'coimbatore'
  | 'cuttack'
  | 'dehradun'
  | 'dharamshala'
  | 'durg'
  | 'faridabad'
  | 'ghaziabad'
  | 'gurugram'
  | 'guwahati'
  | 'gwalior'
  | 'indore'
  | 'jabalpur'
  | 'jalandhar'
  | 'jammu'
  | 'jamshedpur'
  | 'kochi'
  | 'kolkata'
  | 'kozhikode'
  | 'madurai'
  | 'mathura'
  | 'meerut'
  | 'mohali'
  | 'noida'
  | 'patiala'
  | 'patna'
  | 'raipur'
  | 'ranchi'
  | 'shimla'
  | 'siliguri'
  | 'srinagar'
  | 'thiruvananthapuram'
  | 'tiruchirappalli'
  | 'udaipur'
  | 'vadodara'
  | 'varanasi'
  | 'vijayawada'
  | 'visakhapatnam'

export interface CityConfig {
  cityName: string
  citySlug: CitySlug
  domain: string
  heroTitle: string
  heroSubtitle: string
  metaTitle: string
  /** Path to the city's nav-bar logo under `/public`. Cities with a dedicated
   *  DentistIn SVG point at it; cities without one fall back to the generic
   *  `/logo-india.webp`. */
  logoPath: string
  /** Indian state/UT the city belongs to. Used for the /cities page state
   *  grouping and the national-map tooltip. */
  state: string
  /** Decimal-degree centroid used to project the dot onto the India SVG
   *  on the national homepage map. */
  lat: number
  lng: number
  /** Brand chunk shown in the logo when it can't be built from cityName,
   *  e.g. Indore lives on dentistindore.com ("DentistIndore"), Kolkata on
   *  dentistincalcutta.in ("DentistInCalcutta"). */
  brandName?: string
  /** New city still signing up its first dentists. Until it has
   *  OPENING_MIN_DENTISTS active dentists its homepage is the "opening soon"
   *  page, it is kept out of search (robots.txt + noindex + empty sitemap),
   *  and the national site lists it under coming soon. Remove the flag once
   *  the city has enough dentists to count as live everywhere. */
  opening?: boolean
}

export const CITY_CONFIGS: Record<CitySlug, CityConfig> = {
  mumbai:        { cityName: 'Mumbai',         citySlug: 'mumbai',        domain: 'dentistinmumbai.in',         heroTitle: 'Find the Best Dentist in Mumbai',         heroSubtitle: 'Verified dentists across all Mumbai areas', metaTitle: 'Find Dentists in Mumbai | dentistinmumbai.in',                 logoPath: '/logo-mumbai.webp',         state: 'Maharashtra',  lat: 19.0760, lng: 72.8777 },
  navimumbai:    { cityName: 'Navi Mumbai',    citySlug: 'navimumbai',    domain: 'dentistinnavimumbai.in',     heroTitle: 'Find the Best Dentist in Navi Mumbai',    heroSubtitle: 'Verified dentists across Navi Mumbai',      metaTitle: 'Find Dentists in Navi Mumbai | dentistinnavimumbai.in',         logoPath: '/logo-india.webp',     state: 'Maharashtra',  lat: 19.0330, lng: 73.0297 },
  pune:          { cityName: 'Pune',           citySlug: 'pune',          domain: 'dentistinpune.in',           heroTitle: 'Find the Best Dentist in Pune',           heroSubtitle: 'Verified dentists across all Pune areas',   metaTitle: 'Find Dentists in Pune | dentistinpune.in',                     logoPath: '/logo-pune.webp',           state: 'Maharashtra',  lat: 18.5204, lng: 73.8567 },
  thane:         { cityName: 'Thane',          citySlug: 'thane',         domain: 'dentistinthane.com',         heroTitle: 'Find the Best Dentist in Thane',          heroSubtitle: 'Verified dentists across Thane',            metaTitle: 'Find Dentists in Thane | dentistinthane.com',                  logoPath: '/logo-india.webp',          state: 'Maharashtra',  lat: 19.2183, lng: 72.9781 },
  nashik:        { cityName: 'Nashik',         citySlug: 'nashik',        domain: 'dentistinnashik.com',        heroTitle: 'Find the Best Dentist in Nashik',         heroSubtitle: 'Verified dentists across Nashik',           metaTitle: 'Find Dentists in Nashik | dentistinnashik.com',                logoPath: '/logo-nashik.webp',         state: 'Maharashtra',  lat: 19.9975, lng: 73.7898 },
  nagpur:        { cityName: 'Nagpur',         citySlug: 'nagpur',        domain: 'dentistinnagpur.in',         heroTitle: 'Find the Best Dentist in Nagpur',         heroSubtitle: 'Verified dentists across Nagpur',           metaTitle: 'Find Dentists in Nagpur | dentistinnagpur.in',                 logoPath: '/logo-nagpur.webp',         state: 'Maharashtra',  lat: 21.1458, lng: 79.0882 },
  kolhapur:      { cityName: 'Kolhapur',       citySlug: 'kolhapur',      domain: 'dentistinkolhapur.in',       heroTitle: 'Find the Best Dentist in Kolhapur',       heroSubtitle: 'Verified dentists across Kolhapur',         metaTitle: 'Find Dentists in Kolhapur | dentistinkolhapur.in',             logoPath: '/logo-kolhapur.webp',       state: 'Maharashtra',  lat: 16.7050, lng: 74.2433 },
  goa:           { cityName: 'Goa',            citySlug: 'goa',           domain: 'dentistingoa.in',            heroTitle: 'Find the Best Dentist in Goa',            heroSubtitle: 'Verified dentists across Goa',              metaTitle: 'Find Dentists in Goa | dentistingoa.in',                       logoPath: '/logo-goa.webp',            state: 'Goa',          lat: 15.4909, lng: 73.8278 },
  surat:         { cityName: 'Surat',          citySlug: 'surat',         domain: 'dentistinsurat.com',         heroTitle: 'Find the Best Dentist in Surat',          heroSubtitle: 'Verified dentists across Surat',            metaTitle: 'Find Dentists in Surat | dentistinsurat.com',                  logoPath: '/logo-surat.webp',          state: 'Gujarat',      lat: 21.1702, lng: 72.8311 },
  sambhajinagar: { cityName: 'Sambhajinagar',  citySlug: 'sambhajinagar', domain: 'dentistinsambhajinagar.com', heroTitle: 'Find the Best Dentist in Sambhajinagar',  heroSubtitle: 'Verified dentists across Sambhajinagar',    metaTitle: 'Find Dentists in Sambhajinagar | dentistinsambhajinagar.com',  logoPath: '/logo-sambhajinagar.webp',  state: 'Maharashtra',  lat: 19.8762, lng: 75.3433 },
  rajkot:        { cityName: 'Rajkot',         citySlug: 'rajkot',        domain: 'dentistinrajkot.in',         heroTitle: 'Find the Best Dentist in Rajkot',         heroSubtitle: 'Verified dentists across Rajkot',           metaTitle: 'Find Dentists in Rajkot | dentistinrajkot.in',                 logoPath: '/logo-india.webp',         state: 'Gujarat',      lat: 22.3039, lng: 70.8022 },
  ahmedabad:     { cityName: 'Ahmedabad',      citySlug: 'ahmedabad',     domain: 'dentistinahmedabad.com',     heroTitle: 'Find the Best Dentist in Ahmedabad',      heroSubtitle: 'Verified dentists across Ahmedabad',        metaTitle: 'Find Dentists in Ahmedabad | dentistinahmedabad.com',          logoPath: '/logo-india.webp',      state: 'Gujarat',      lat: 23.0225, lng: 72.5714 },
  jamnagar:      { cityName: 'Jamnagar',       citySlug: 'jamnagar',      domain: 'dentistinjamnagar.in',       heroTitle: 'Find the Best Dentist in Jamnagar',       heroSubtitle: 'Verified dentists across Jamnagar',         metaTitle: 'Find Dentists in Jamnagar | dentistinjamnagar.in',             logoPath: '/logo-india.webp',                state: 'Gujarat',      lat: 22.4707, lng: 70.0577 },
  bangalore:     { cityName: 'Bangalore',      citySlug: 'bangalore',     domain: 'dentistinbangalore.in',      heroTitle: 'Find Verified Dentists in Bangalore',     heroSubtitle: 'Compare fees, read reviews and book instantly', metaTitle: 'Dentists in Bangalore — Verified Clinics & Real Fees | DentistIn Bangalore', logoPath: '/logo-india.webp',      state: 'Karnataka',    lat: 12.9716, lng: 77.5946 },
  mysore:        { cityName: 'Mysore',         citySlug: 'mysore',        domain: 'dentistinmysore.com',        heroTitle: 'Find Verified Dentists in Mysore',        heroSubtitle: 'Compare fees, read reviews and book instantly', metaTitle: 'Dentists in Mysore — Verified Clinics & Real Fees | DentistIn Mysore',       logoPath: '/logo-india.webp',      state: 'Karnataka',    lat: 12.2958, lng: 76.6394 },
  mangalore:     { cityName: 'Mangalore',      citySlug: 'mangalore',     domain: 'dentistinmangalore.com',     heroTitle: 'Find Verified Dentists in Mangalore',     heroSubtitle: 'Compare fees, read reviews and book instantly', metaTitle: 'Dentists in Mangalore — Verified Clinics & Real Fees | DentistIn Mangalore', logoPath: '/logo-india.webp',      state: 'Karnataka',    lat: 12.9141, lng: 74.8560 },

  // Opening cities (24 Nov 2026): domains we own, signing up their first
  // dentists. See CityConfig.opening.
  agra: { cityName: 'Agra', citySlug: 'agra', domain: 'dentistinagra.com', heroTitle: 'Find a Trusted Dentist in Agra', heroSubtitle: 'Verified dentists across Agra', metaTitle: 'Dentist in Agra | DentistInAgra', logoPath: '/logo-india.webp', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081, opening: true },
  amritsar: { cityName: 'Amritsar', citySlug: 'amritsar', domain: 'dentistinamritsar.com', heroTitle: 'Find a Trusted Dentist in Amritsar', heroSubtitle: 'Verified dentists across Amritsar', metaTitle: 'Dentist in Amritsar | DentistInAmritsar', logoPath: '/logo-india.webp', state: 'Punjab', lat: 31.634, lng: 74.8723, opening: true },
  bhopal: { cityName: 'Bhopal', citySlug: 'bhopal', domain: 'dentistinbhopal.com', heroTitle: 'Find a Trusted Dentist in Bhopal', heroSubtitle: 'Verified dentists across Bhopal', metaTitle: 'Dentist in Bhopal | DentistInBhopal', logoPath: '/logo-india.webp', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, opening: true },
  bhubaneswar: { cityName: 'Bhubaneswar', citySlug: 'bhubaneswar', domain: 'dentistinbhubaneswar.com', heroTitle: 'Find a Trusted Dentist in Bhubaneswar', heroSubtitle: 'Verified dentists across Bhubaneswar', metaTitle: 'Dentist in Bhubaneswar | DentistInBhubaneswar', logoPath: '/logo-india.webp', state: 'Odisha', lat: 20.2961, lng: 85.8245, opening: true },
  bilaspur: { cityName: 'Bilaspur', citySlug: 'bilaspur', domain: 'dentistinbilaspur.in', heroTitle: 'Find a Trusted Dentist in Bilaspur', heroSubtitle: 'Verified dentists across Bilaspur', metaTitle: 'Dentist in Bilaspur | DentistInBilaspur', logoPath: '/logo-india.webp', state: 'Chhattisgarh', lat: 22.0797, lng: 82.1409, opening: true },
  chandigarh: { cityName: 'Chandigarh', citySlug: 'chandigarh', domain: 'dentistinchandigarh.in', heroTitle: 'Find a Trusted Dentist in Chandigarh', heroSubtitle: 'Verified dentists across Chandigarh', metaTitle: 'Dentist in Chandigarh | DentistInChandigarh', logoPath: '/logo-india.webp', state: 'Chandigarh', lat: 30.7333, lng: 76.7794, opening: true },
  chennai: { cityName: 'Chennai', citySlug: 'chennai', domain: 'dentistinchennai.in', heroTitle: 'Find a Trusted Dentist in Chennai', heroSubtitle: 'Verified dentists across Chennai', metaTitle: 'Dentist in Chennai | DentistInChennai', logoPath: '/logo-india.webp', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, opening: true },
  coimbatore: { cityName: 'Coimbatore', citySlug: 'coimbatore', domain: 'dentistincoimbatore.com', heroTitle: 'Find a Trusted Dentist in Coimbatore', heroSubtitle: 'Verified dentists across Coimbatore', metaTitle: 'Dentist in Coimbatore | DentistInCoimbatore', logoPath: '/logo-india.webp', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558, opening: true },
  cuttack: { cityName: 'Cuttack', citySlug: 'cuttack', domain: 'dentistincuttack.in', heroTitle: 'Find a Trusted Dentist in Cuttack', heroSubtitle: 'Verified dentists across Cuttack', metaTitle: 'Dentist in Cuttack | DentistInCuttack', logoPath: '/logo-india.webp', state: 'Odisha', lat: 20.4625, lng: 85.883, opening: true },
  dehradun: { cityName: 'Dehradun', citySlug: 'dehradun', domain: 'dentistindehradun.in', heroTitle: 'Find a Trusted Dentist in Dehradun', heroSubtitle: 'Verified dentists across Dehradun', metaTitle: 'Dentist in Dehradun | DentistInDehradun', logoPath: '/logo-india.webp', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322, opening: true },
  dharamshala: { cityName: 'Dharamshala', citySlug: 'dharamshala', domain: 'dentistindharamshala.in', heroTitle: 'Find a Trusted Dentist in Dharamshala', heroSubtitle: 'Verified dentists across Dharamshala', metaTitle: 'Dentist in Dharamshala | DentistInDharamshala', logoPath: '/logo-india.webp', state: 'Himachal Pradesh', lat: 32.219, lng: 76.3234, opening: true },
  durg: { cityName: 'Durg', citySlug: 'durg', domain: 'dentistindurg.in', heroTitle: 'Find a Trusted Dentist in Durg', heroSubtitle: 'Verified dentists across Durg', metaTitle: 'Dentist in Durg | DentistInDurg', logoPath: '/logo-india.webp', state: 'Chhattisgarh', lat: 21.1904, lng: 81.2849, opening: true },
  faridabad: { cityName: 'Faridabad', citySlug: 'faridabad', domain: 'dentistinfaridabad.com', heroTitle: 'Find a Trusted Dentist in Faridabad', heroSubtitle: 'Verified dentists across Faridabad', metaTitle: 'Dentist in Faridabad | DentistInFaridabad', logoPath: '/logo-india.webp', state: 'Haryana', lat: 28.4089, lng: 77.3178, opening: true },
  ghaziabad: { cityName: 'Ghaziabad', citySlug: 'ghaziabad', domain: 'dentistinghaziabad.com', heroTitle: 'Find a Trusted Dentist in Ghaziabad', heroSubtitle: 'Verified dentists across Ghaziabad', metaTitle: 'Dentist in Ghaziabad | DentistInGhaziabad', logoPath: '/logo-india.webp', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538, opening: true },
  gurugram: { cityName: 'Gurugram', citySlug: 'gurugram', domain: 'dentistingurugram.in', heroTitle: 'Find a Trusted Dentist in Gurugram', heroSubtitle: 'Verified dentists across Gurugram', metaTitle: 'Dentist in Gurugram | DentistInGurugram', logoPath: '/logo-india.webp', state: 'Haryana', lat: 28.4595, lng: 77.0266, opening: true },
  guwahati: { cityName: 'Guwahati', citySlug: 'guwahati', domain: 'dentistinguwahati.com', heroTitle: 'Find a Trusted Dentist in Guwahati', heroSubtitle: 'Verified dentists across Guwahati', metaTitle: 'Dentist in Guwahati | DentistInGuwahati', logoPath: '/logo-india.webp', state: 'Assam', lat: 26.1445, lng: 91.7362, opening: true },
  gwalior: { cityName: 'Gwalior', citySlug: 'gwalior', domain: 'dentistingwalior.in', heroTitle: 'Find a Trusted Dentist in Gwalior', heroSubtitle: 'Verified dentists across Gwalior', metaTitle: 'Dentist in Gwalior | DentistInGwalior', logoPath: '/logo-india.webp', state: 'Madhya Pradesh', lat: 26.2183, lng: 78.1828, opening: true },
  indore: { cityName: 'Indore', citySlug: 'indore', domain: 'dentistindore.com', heroTitle: 'Find a Trusted Dentist in Indore', heroSubtitle: 'Verified dentists across Indore', metaTitle: 'Dentist in Indore | DentistIndore', logoPath: '/logo-india.webp', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577, brandName: 'DentistIndore', opening: true },
  jabalpur: { cityName: 'Jabalpur', citySlug: 'jabalpur', domain: 'dentistinjabalpur.in', heroTitle: 'Find a Trusted Dentist in Jabalpur', heroSubtitle: 'Verified dentists across Jabalpur', metaTitle: 'Dentist in Jabalpur | DentistInJabalpur', logoPath: '/logo-india.webp', state: 'Madhya Pradesh', lat: 23.1815, lng: 79.9864, opening: true },
  jalandhar: { cityName: 'Jalandhar', citySlug: 'jalandhar', domain: 'dentistinjalandhar.in', heroTitle: 'Find a Trusted Dentist in Jalandhar', heroSubtitle: 'Verified dentists across Jalandhar', metaTitle: 'Dentist in Jalandhar | DentistInJalandhar', logoPath: '/logo-india.webp', state: 'Punjab', lat: 31.326, lng: 75.5762, opening: true },
  jammu: { cityName: 'Jammu', citySlug: 'jammu', domain: 'dentistinjammu.in', heroTitle: 'Find a Trusted Dentist in Jammu', heroSubtitle: 'Verified dentists across Jammu', metaTitle: 'Dentist in Jammu | DentistInJammu', logoPath: '/logo-india.webp', state: 'Jammu and Kashmir', lat: 32.7266, lng: 74.857, opening: true },
  jamshedpur: { cityName: 'Jamshedpur', citySlug: 'jamshedpur', domain: 'dentistinjamshedpur.in', heroTitle: 'Find a Trusted Dentist in Jamshedpur', heroSubtitle: 'Verified dentists across Jamshedpur', metaTitle: 'Dentist in Jamshedpur | DentistInJamshedpur', logoPath: '/logo-india.webp', state: 'Jharkhand', lat: 22.8046, lng: 86.2029, opening: true },
  kochi: { cityName: 'Kochi', citySlug: 'kochi', domain: 'dentistinkochi.com', heroTitle: 'Find a Trusted Dentist in Kochi', heroSubtitle: 'Verified dentists across Kochi', metaTitle: 'Dentist in Kochi | DentistInKochi', logoPath: '/logo-india.webp', state: 'Kerala', lat: 9.9312, lng: 76.2673, opening: true },
  kolkata: { cityName: 'Kolkata', citySlug: 'kolkata', domain: 'dentistincalcutta.in', heroTitle: 'Find a Trusted Dentist in Kolkata', heroSubtitle: 'Verified dentists across Kolkata', metaTitle: 'Dentist in Kolkata | DentistInCalcutta', logoPath: '/logo-india.webp', state: 'West Bengal', lat: 22.5726, lng: 88.3639, brandName: 'DentistInCalcutta', opening: true },
  kozhikode: { cityName: 'Kozhikode', citySlug: 'kozhikode', domain: 'dentistinkozhikode.com', heroTitle: 'Find a Trusted Dentist in Kozhikode', heroSubtitle: 'Verified dentists across Kozhikode', metaTitle: 'Dentist in Kozhikode | DentistInKozhikode', logoPath: '/logo-india.webp', state: 'Kerala', lat: 11.2588, lng: 75.7804, opening: true },
  madurai: { cityName: 'Madurai', citySlug: 'madurai', domain: 'dentistinmadurai.com', heroTitle: 'Find a Trusted Dentist in Madurai', heroSubtitle: 'Verified dentists across Madurai', metaTitle: 'Dentist in Madurai | DentistInMadurai', logoPath: '/logo-india.webp', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198, opening: true },
  mathura: { cityName: 'Mathura', citySlug: 'mathura', domain: 'dentistinmathura.in', heroTitle: 'Find a Trusted Dentist in Mathura', heroSubtitle: 'Verified dentists across Mathura', metaTitle: 'Dentist in Mathura | DentistInMathura', logoPath: '/logo-india.webp', state: 'Uttar Pradesh', lat: 27.4924, lng: 77.6737, opening: true },
  meerut: { cityName: 'Meerut', citySlug: 'meerut', domain: 'dentistinmeerut.in', heroTitle: 'Find a Trusted Dentist in Meerut', heroSubtitle: 'Verified dentists across Meerut', metaTitle: 'Dentist in Meerut | DentistInMeerut', logoPath: '/logo-india.webp', state: 'Uttar Pradesh', lat: 28.9845, lng: 77.7064, opening: true },
  mohali: { cityName: 'Mohali', citySlug: 'mohali', domain: 'dentistinmohali.in', heroTitle: 'Find a Trusted Dentist in Mohali', heroSubtitle: 'Verified dentists across Mohali', metaTitle: 'Dentist in Mohali | DentistInMohali', logoPath: '/logo-india.webp', state: 'Punjab', lat: 30.7046, lng: 76.7179, opening: true },
  noida: { cityName: 'Noida', citySlug: 'noida', domain: 'dentistinnoida.in', heroTitle: 'Find a Trusted Dentist in Noida', heroSubtitle: 'Verified dentists across Noida', metaTitle: 'Dentist in Noida | DentistInNoida', logoPath: '/logo-india.webp', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.391, opening: true },
  patiala: { cityName: 'Patiala', citySlug: 'patiala', domain: 'dentistinpatiala.in', heroTitle: 'Find a Trusted Dentist in Patiala', heroSubtitle: 'Verified dentists across Patiala', metaTitle: 'Dentist in Patiala | DentistInPatiala', logoPath: '/logo-india.webp', state: 'Punjab', lat: 30.3398, lng: 76.3869, opening: true },
  patna: { cityName: 'Patna', citySlug: 'patna', domain: 'dentistinpatna.com', heroTitle: 'Find a Trusted Dentist in Patna', heroSubtitle: 'Verified dentists across Patna', metaTitle: 'Dentist in Patna | DentistInPatna', logoPath: '/logo-india.webp', state: 'Bihar', lat: 25.5941, lng: 85.1376, opening: true },
  raipur: { cityName: 'Raipur', citySlug: 'raipur', domain: 'dentistinraipur.com', heroTitle: 'Find a Trusted Dentist in Raipur', heroSubtitle: 'Verified dentists across Raipur', metaTitle: 'Dentist in Raipur | DentistInRaipur', logoPath: '/logo-india.webp', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296, opening: true },
  ranchi: { cityName: 'Ranchi', citySlug: 'ranchi', domain: 'dentistinranchi.com', heroTitle: 'Find a Trusted Dentist in Ranchi', heroSubtitle: 'Verified dentists across Ranchi', metaTitle: 'Dentist in Ranchi | DentistInRanchi', logoPath: '/logo-india.webp', state: 'Jharkhand', lat: 23.3441, lng: 85.3096, opening: true },
  shimla: { cityName: 'Shimla', citySlug: 'shimla', domain: 'dentistinshimla.in', heroTitle: 'Find a Trusted Dentist in Shimla', heroSubtitle: 'Verified dentists across Shimla', metaTitle: 'Dentist in Shimla | DentistInShimla', logoPath: '/logo-india.webp', state: 'Himachal Pradesh', lat: 31.1048, lng: 77.1734, opening: true },
  siliguri: { cityName: 'Siliguri', citySlug: 'siliguri', domain: 'dentistinsiliguri.in', heroTitle: 'Find a Trusted Dentist in Siliguri', heroSubtitle: 'Verified dentists across Siliguri', metaTitle: 'Dentist in Siliguri | DentistInSiliguri', logoPath: '/logo-india.webp', state: 'West Bengal', lat: 26.7271, lng: 88.3953, opening: true },
  srinagar: { cityName: 'Srinagar', citySlug: 'srinagar', domain: 'dentistinsrinagar.in', heroTitle: 'Find a Trusted Dentist in Srinagar', heroSubtitle: 'Verified dentists across Srinagar', metaTitle: 'Dentist in Srinagar | DentistInSrinagar', logoPath: '/logo-india.webp', state: 'Jammu and Kashmir', lat: 34.0837, lng: 74.7973, opening: true },
  thiruvananthapuram: { cityName: 'Thiruvananthapuram', citySlug: 'thiruvananthapuram', domain: 'dentistinthiruvananthapuram.com', heroTitle: 'Find a Trusted Dentist in Thiruvananthapuram', heroSubtitle: 'Verified dentists across Thiruvananthapuram', metaTitle: 'Dentist in Thiruvananthapuram | DentistInThiruvananthapuram', logoPath: '/logo-india.webp', state: 'Kerala', lat: 8.5241, lng: 76.9366, opening: true },
  tiruchirappalli: { cityName: 'Trichy', citySlug: 'tiruchirappalli', domain: 'dentistintrichy.com', heroTitle: 'Find a Trusted Dentist in Trichy', heroSubtitle: 'Verified dentists across Trichy', metaTitle: 'Dentist in Trichy | DentistInTrichy', logoPath: '/logo-india.webp', state: 'Tamil Nadu', lat: 10.7905, lng: 78.7047, opening: true },
  udaipur: { cityName: 'Udaipur', citySlug: 'udaipur', domain: 'dentistinudaipur.in', heroTitle: 'Find a Trusted Dentist in Udaipur', heroSubtitle: 'Verified dentists across Udaipur', metaTitle: 'Dentist in Udaipur | DentistInUdaipur', logoPath: '/logo-india.webp', state: 'Rajasthan', lat: 24.5854, lng: 73.7125, opening: true },
  vadodara: { cityName: 'Vadodara', citySlug: 'vadodara', domain: 'dentistinvadodara.in', heroTitle: 'Find a Trusted Dentist in Vadodara', heroSubtitle: 'Verified dentists across Vadodara', metaTitle: 'Dentist in Vadodara | DentistInVadodara', logoPath: '/logo-india.webp', state: 'Gujarat', lat: 22.3072, lng: 73.1812, opening: true },
  varanasi: { cityName: 'Varanasi', citySlug: 'varanasi', domain: 'dentistinvaranasi.com', heroTitle: 'Find a Trusted Dentist in Varanasi', heroSubtitle: 'Verified dentists across Varanasi', metaTitle: 'Dentist in Varanasi | DentistInVaranasi', logoPath: '/logo-india.webp', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739, opening: true },
  vijayawada: { cityName: 'Vijayawada', citySlug: 'vijayawada', domain: 'dentistinvijayawada.com', heroTitle: 'Find a Trusted Dentist in Vijayawada', heroSubtitle: 'Verified dentists across Vijayawada', metaTitle: 'Dentist in Vijayawada | DentistInVijayawada', logoPath: '/logo-india.webp', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.648, opening: true },
  visakhapatnam: { cityName: 'Visakhapatnam', citySlug: 'visakhapatnam', domain: 'dentistinvisakhapatnam.com', heroTitle: 'Find a Trusted Dentist in Visakhapatnam', heroSubtitle: 'Verified dentists across Visakhapatnam', metaTitle: 'Dentist in Visakhapatnam | DentistInVisakhapatnam', logoPath: '/logo-india.webp', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185, opening: true },
}

export const DEFAULT_CITY: CitySlug = 'mumbai'

/** Active dentists an opening city needs before it becomes a full city site. */
export const OPENING_MIN_DENTISTS = 5

/** Cities shown as live across the network (footer links, national site,
 *  maps, counts). Opening cities are left out until their flag is removed. */
export const LIVE_CITY_CONFIGS: CityConfig[] = Object.values(CITY_CONFIGS).filter(c => !c.opening)

/** Opening cities, listed as "coming soon" on the national site. */
export const OPENING_CITY_CONFIGS: CityConfig[] = Object.values(CITY_CONFIGS).filter(c => !!c.opening)

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
  return city.brandName ?? `DentistIn${city.cityName.replace(/\s+/g, '')}`
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
