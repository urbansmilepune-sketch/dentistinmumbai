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

export interface ComingSoonCity {
  slug: string
  name: string
  state: string
  lat: number
  lng: number
}

export const COMING_SOON_CITIES: ComingSoonCity[] = [
  // Tier-1 metros (not already live)
  { slug: 'delhi',            name: 'Delhi',            state: 'Delhi',                lat: 28.6139, lng: 77.2090 },
  { slug: 'bangalore',        name: 'Bangalore',        state: 'Karnataka',            lat: 12.9716, lng: 77.5946 },
  { slug: 'hyderabad',        name: 'Hyderabad',        state: 'Telangana',            lat: 17.3850, lng: 78.4867 },
  { slug: 'chennai',          name: 'Chennai',          state: 'Tamil Nadu',           lat: 13.0827, lng: 80.2707 },
  { slug: 'kolkata',          name: 'Kolkata',          state: 'West Bengal',          lat: 22.5726, lng: 88.3639 },

  // Tier-2 / large state capitals
  { slug: 'jaipur',           name: 'Jaipur',           state: 'Rajasthan',            lat: 26.9124, lng: 75.7873 },
  { slug: 'lucknow',          name: 'Lucknow',          state: 'Uttar Pradesh',        lat: 26.8467, lng: 80.9462 },
  { slug: 'kanpur',           name: 'Kanpur',           state: 'Uttar Pradesh',        lat: 26.4499, lng: 80.3319 },
  { slug: 'indore',           name: 'Indore',           state: 'Madhya Pradesh',       lat: 22.7196, lng: 75.8577 },
  { slug: 'bhopal',           name: 'Bhopal',           state: 'Madhya Pradesh',       lat: 23.2599, lng: 77.4126 },
  { slug: 'patna',            name: 'Patna',            state: 'Bihar',                lat: 25.5941, lng: 85.1376 },
  { slug: 'vadodara',         name: 'Vadodara',         state: 'Gujarat',              lat: 22.3072, lng: 73.1812 },
  { slug: 'ghaziabad',        name: 'Ghaziabad',        state: 'Uttar Pradesh',        lat: 28.6692, lng: 77.4538 },
  { slug: 'ludhiana',         name: 'Ludhiana',         state: 'Punjab',               lat: 30.9010, lng: 75.8573 },
  { slug: 'agra',             name: 'Agra',             state: 'Uttar Pradesh',        lat: 27.1767, lng: 78.0081 },
  { slug: 'faridabad',        name: 'Faridabad',        state: 'Haryana',              lat: 28.4089, lng: 77.3178 },
  { slug: 'coimbatore',       name: 'Coimbatore',       state: 'Tamil Nadu',           lat: 11.0168, lng: 76.9558 },
  { slug: 'varanasi',         name: 'Varanasi',         state: 'Uttar Pradesh',        lat: 25.3176, lng: 82.9739 },
  { slug: 'visakhapatnam',    name: 'Visakhapatnam',    state: 'Andhra Pradesh',       lat: 17.6868, lng: 83.2185 },
  { slug: 'madurai',          name: 'Madurai',          state: 'Tamil Nadu',           lat:  9.9252, lng: 78.1198 },
  { slug: 'prayagraj',        name: 'Prayagraj',        state: 'Uttar Pradesh',        lat: 25.4358, lng: 81.8463 },
  { slug: 'amritsar',         name: 'Amritsar',         state: 'Punjab',               lat: 31.6340, lng: 74.8723 },
  { slug: 'vijayawada',       name: 'Vijayawada',       state: 'Andhra Pradesh',       lat: 16.5062, lng: 80.6480 },
  { slug: 'dhanbad',          name: 'Dhanbad',          state: 'Jharkhand',            lat: 23.7957, lng: 86.4304 },
  { slug: 'solapur',          name: 'Solapur',          state: 'Maharashtra',          lat: 17.6599, lng: 75.9064 },
  { slug: 'srinagar',         name: 'Srinagar',         state: 'Jammu and Kashmir',    lat: 34.0837, lng: 74.7973 },
  { slug: 'ranchi',           name: 'Ranchi',           state: 'Jharkhand',            lat: 23.3441, lng: 85.3096 },
  { slug: 'jodhpur',          name: 'Jodhpur',          state: 'Rajasthan',            lat: 26.2389, lng: 73.0243 },
  { slug: 'raipur',           name: 'Raipur',           state: 'Chhattisgarh',         lat: 21.2514, lng: 81.6296 },
  { slug: 'guwahati',         name: 'Guwahati',         state: 'Assam',                lat: 26.1445, lng: 91.7362 },
  { slug: 'chandigarh',       name: 'Chandigarh',       state: 'Chandigarh',           lat: 30.7333, lng: 76.7794 },
  { slug: 'mysuru',           name: 'Mysuru',           state: 'Karnataka',            lat: 12.2958, lng: 76.6394 },
  { slug: 'bhubaneswar',      name: 'Bhubaneswar',      state: 'Odisha',               lat: 20.2961, lng: 85.8245 },
  { slug: 'tiruchirappalli',  name: 'Tiruchirappalli',  state: 'Tamil Nadu',           lat: 10.7905, lng: 78.7047 },
  { slug: 'jabalpur',         name: 'Jabalpur',         state: 'Madhya Pradesh',       lat: 23.1815, lng: 79.9864 },
  { slug: 'gwalior',          name: 'Gwalior',          state: 'Madhya Pradesh',       lat: 26.2183, lng: 78.1828 },
  { slug: 'salem',            name: 'Salem',            state: 'Tamil Nadu',           lat: 11.6643, lng: 78.1460 },
  { slug: 'dehradun',         name: 'Dehradun',         state: 'Uttarakhand',          lat: 30.3165, lng: 78.0322 },

  // Smaller state capitals — included so every Indian state has at least
  // one pin on the national map, even where dental volume is modest.
  { slug: 'shimla',           name: 'Shimla',           state: 'Himachal Pradesh',     lat: 31.1048, lng: 77.1734 },
  { slug: 'gangtok',          name: 'Gangtok',          state: 'Sikkim',               lat: 27.3389, lng: 88.6065 },
  { slug: 'imphal',           name: 'Imphal',           state: 'Manipur',              lat: 24.8170, lng: 93.9368 },
  { slug: 'shillong',         name: 'Shillong',         state: 'Meghalaya',            lat: 25.5788, lng: 91.8933 },
  { slug: 'itanagar',         name: 'Itanagar',         state: 'Arunachal Pradesh',    lat: 27.0844, lng: 93.6053 },
  { slug: 'kohima',           name: 'Kohima',           state: 'Nagaland',             lat: 25.6701, lng: 94.1077 },
  { slug: 'aizawl',           name: 'Aizawl',           state: 'Mizoram',              lat: 23.7271, lng: 92.7176 },
  { slug: 'agartala',         name: 'Agartala',         state: 'Tripura',              lat: 23.8315, lng: 91.2868 },

  // Kerala + South coverage
  { slug: 'thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala',           lat:  8.5241, lng: 76.9366 },
  { slug: 'kochi',            name: 'Kochi',            state: 'Kerala',               lat:  9.9312, lng: 76.2673 },
  { slug: 'mangalore',        name: 'Mangalore',        state: 'Karnataka',            lat: 12.9141, lng: 74.8560 },
  { slug: 'puducherry',       name: 'Puducherry',       state: 'Puducherry',           lat: 11.9416, lng: 79.8083 },
]
