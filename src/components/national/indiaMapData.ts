// Server-side projection of the simplified India state GeoJSON into
// SVG-space using d3-geo. Splitting this out of the React component
// keeps d3-geo + the 559 KB GeoJSON OUT of the client bundle — only
// the small projected path strings + city {x,y} positions ever cross
// the network. Module-level state so the projection is computed once
// per Vercel function cold-start and reused for every request.
//
// Don't import this file from any module that starts with 'use client'.
// The right entry point is a server component (e.g. NationalHome.tsx),
// which then passes the projected data down as props.

import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import indiaGeo from './india-states.json'
import { CITY_CONFIGS } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'

// viewBox dimensions. d3.geoMercator().fitSize() fits the GeoJSON inside
// this box, so changing these values just rescales — no projection math
// needed elsewhere. 1000 × 1100 keeps the SVG precise at the homepage's
// 720 px display width without producing coordinates that overflow ints.
export const VB_W = 1000
export const VB_H = 1100

// fitSize works on either a Feature or FeatureCollection. Cast through
// unknown because our JSON's properties don't precisely match the GeoJSON
// type guards d3-geo's typings expect.
const projection = geoMercator().fitSize(
  [VB_W, VB_H],
  indiaGeo as unknown as GeoPermissibleObjects,
)
const pathGen = geoPath(projection)

export interface StatePath {
  name: string
  d: string
}

export interface LiveDot {
  kind: 'live'
  slug: string
  name: string
  state: string
  domain: string
  x: number
  y: number
}

export interface SoonDot {
  kind: 'soon'
  slug: string
  name: string
  state: string
  x: number
  y: number
}

export type Dot = LiveDot | SoonDot

// One SVG path per state feature. Filter out empty paths (rare, but
// d3-geo returns null when the feature lies entirely outside the
// projection's clip extent, which our fitSize call should avoid).
export const STATE_PATHS: StatePath[] = (indiaGeo as { features: { properties: { st_nm: string }; geometry: any }[] }).features
  .map(f => ({ name: f.properties.st_nm, d: pathGen(f as any) || '' }))
  .filter(p => p.d.length > 0)

// City dots. We project both live + coming-soon cities through the same
// projection so they land precisely on the state outline. Live cities
// render last on the client so their halo isn't covered by neighbouring
// coming-soon dots.
export const LIVE_DOTS: LiveDot[] = Object.values(CITY_CONFIGS).map(c => {
  const [x, y] = projection([c.lng, c.lat]) || [0, 0]
  return { kind: 'live', slug: c.citySlug, name: c.cityName, state: c.state, domain: c.domain, x, y }
})

export const SOON_DOTS: SoonDot[] = COMING_SOON_CITIES.map(c => {
  const [x, y] = projection([c.lng, c.lat]) || [0, 0]
  return { kind: 'soon', slug: c.slug, name: c.name, state: c.state, x, y }
})
