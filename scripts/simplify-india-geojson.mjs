// One-shot. Reads /tmp/india-raw.geojson (district-level India outline,
// ~3.8MB) and emits a simplified version into
// src/components/national/india-states.json, dissolving district detail
// down to country/state-recognisable boundaries via Douglas-Peucker.
//
// Run: node scripts/simplify-india-geojson.mjs
//
// Tolerance is in lat/lng degrees. 0.03° ≈ 3 km — finer than the 720px
// SVG can render anyway, so larger tolerances don't visibly hurt at the
// homepage's map size. We also drop tiny polygon rings (small islands,
// noisy outliers) below the area threshold to keep the file tight.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOL = 0.04          // degrees ≈ 4 km of detail kept
const MIN_RING_AREA = 0.001 // ~12 km² — strip tiny islands

const here = dirname(fileURLToPath(import.meta.url))
const SRC  = resolve(here, '..', 'tmp', 'india-raw.geojson')
const OUT  = resolve(here, '..', 'src', 'components', 'national', 'india-states.json')

function perpDist(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

// Iterative Douglas-Peucker so we don't blow the stack on long rings.
function simplify(points, tol) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    let maxD = 0, maxK = -1
    for (let k = i + 1; k < j; k++) {
      const d = perpDist(points[k], points[i], points[j])
      if (d > maxD) { maxD = d; maxK = k }
    }
    if (maxD > tol && maxK > -1) {
      keep[maxK] = 1
      stack.push([i, maxK], [maxK, j])
    }
  }
  const out = []
  for (let k = 0; k < points.length; k++) if (keep[k]) out.push(points[k])
  return out
}

// Shoelace formula on a closed ring (last point == first point).
function ringArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(a) / 2
}

function processRing(ring) {
  if (ringArea(ring) < MIN_RING_AREA) return null
  const simpler = simplify(ring, TOL)
  return simpler.length >= 4 ? simpler : null
}

function processPolygon(poly) {
  // poly = [outerRing, holeRing?, holeRing?, ...]
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const r = processRing(poly[i])
    if (!r) continue
    out.push(r)
  }
  return out.length ? out : null
}

function processGeometry(geom) {
  if (!geom) return null
  if (geom.type === 'Polygon') {
    const p = processPolygon(geom.coordinates)
    return p ? { type: 'Polygon', coordinates: p } : null
  }
  if (geom.type === 'MultiPolygon') {
    const polys = []
    for (const p of geom.coordinates) {
      const r = processPolygon(p)
      if (r) polys.push(r)
    }
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null
  }
  return null
}

// ── Run ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(SRC, 'utf8'))
console.log('input features:', raw.features.length, '— bytes:', readFileSync(SRC).length.toLocaleString())

// Dissolve districts into states by grouping every input feature by its
// `st_nm` property. We collect all polygon rings per state and emit one
// MultiPolygon Feature per state. Cheap and produces a clean state-level
// outline without needing a true polygon-union library.
const byState = new Map()
for (const f of raw.features) {
  const stateName = f.properties?.st_nm || 'Unknown'
  const g = processGeometry(f.geometry)
  if (!g) continue
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  const bucket = byState.get(stateName) || []
  for (const p of polys) bucket.push(p)
  byState.set(stateName, bucket)
}

const features = []
for (const [stateName, polys] of byState) {
  features.push({
    type: 'Feature',
    properties: { st_nm: stateName },
    geometry: { type: 'MultiPolygon', coordinates: polys },
  })
}

const out = { type: 'FeatureCollection', features }
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out))
console.log('output features:', features.length, '— bytes:', readFileSync(OUT).length.toLocaleString())
