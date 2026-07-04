#!/usr/bin/env node
// Backfill: populate dentists.lat / dentists.lng from coordinates already
// present in each dentist's saved maps_embed, so the /dentists "Near Me"
// proximity sort has data to work with. The server route now stores coords
// on every new maps save (src/app/api/dentist/maps-embed/route.ts); this
// script catches the rows saved before that landed.
//
// Usage:
//   node scripts/backfill-coords.mjs            # dry-run (default)
//   node scripts/backfill-coords.mjs --apply    # write lat/lng
//
// Reads Supabase credentials from .env.local (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY) and uses the service-role client (bypasses RLS).
//
// Coordinate sources, in priority order:
//   1. @lat,lng          — raw Google Maps URL form. LATLNG_RE, copied verbatim
//                          from the server route.
//   2. pb= blob (!3d/!2d) — the canonical /maps/embed?pb= iframe encodes the map
//                          centre as !2d<lng>!3d<lat>. This is where the real
//                          coords live in this dataset (see report); LATLNG_RE
//                          alone matches none of the live rows.
//   3. q= / center=       — the keyless maps.google.com/maps?q=<lat>,<lng> and
//                          Embed-API center=<lat>,<lng> forms this app generates.
//
// Rows whose embed carries only a CID or a place-name (no coordinates) are
// reported as NEEDS_GEOCODE — they need a geocoding pass we don't do here.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

function loadEnvLocal() {
  const env = {}
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* fall back to process.env below */ }
  return env
}

const fileEnv = loadEnvLocal()
const SUPABASE_URL = fileEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = fileEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local).')
  process.exit(1)
}

// LATLNG_RE is copied verbatim from src/app/api/dentist/maps-embed/route.ts.
const LATLNG_RE = /@(-?\d+\.\d+),(-?\d+\.\d+)/
// The pb= embed encodes centre as !2d<longitude>!3d<latitude> (note the order).
const PB_LNG_RE = /!2d(-?\d+\.\d+)/
const PB_LAT_RE = /!3d(-?\d+\.\d+)/
// Keyless q=/center= embeds carry <lat>,<lng>.
const QLL_RE = /[?&](?:q|center)=(-?\d+\.\d+),(-?\d+\.\d+)/
// No-coordinate signals: a CID (either the ?cid= param or the !1s0x…:0x… blob)
// or a /maps/place/<name>/ segment.
const CID_RE = /(?:[?&]cid=\d+|!1s0x[0-9a-f]+:0x[0-9a-f]+)/i
const PLACE_RE = /\/maps\/place\/([^/?@]+)/i

// Pull the src attribute out of an <iframe>; otherwise treat the value as a
// bare URL so a raw pasted link still gets scanned.
function srcOf(raw) {
  const m = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : raw
}

function inRange(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

// Returns { lat, lng, source } or null.
function extractCoords(src) {
  const ll = src.match(LATLNG_RE)
  if (ll) {
    const lat = parseFloat(ll[1]), lng = parseFloat(ll[2])
    if (inRange(lat, lng)) return { lat, lng, source: '@latlng' }
  }
  const q = src.match(QLL_RE)
  if (q) {
    const lat = parseFloat(q[1]), lng = parseFloat(q[2])
    if (inRange(lat, lng)) return { lat, lng, source: 'q=/center=' }
  }
  const plat = src.match(PB_LAT_RE), plng = src.match(PB_LNG_RE)
  if (plat && plng) {
    const lat = parseFloat(plat[1]), lng = parseFloat(plng[1])
    if (inRange(lat, lng)) return { lat, lng, source: 'pb=' }
  }
  return null
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const { data, error } = await db
  .from('dentists')
  .select('id, name, maps_embed, lat, lng')
  .not('maps_embed', 'is', null)
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const rows = data ?? []
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`${rows.length} dentist(s) with a non-null maps_embed.\n`)

let updated = 0, alreadySet = 0, needsGeocode = 0, skipped = 0, failed = 0
const bySource = {}

for (const d of rows) {
  const name = (d.name || '(unnamed)').slice(0, 34).padEnd(34)
  const raw = (d.maps_embed || '').trim()

  if (!raw) { skipped++; console.log(`SKIP          ${name} (empty maps_embed)`); continue }

  if (d.lat != null && d.lng != null) {
    alreadySet++
    console.log(`SKIP          ${name} already has coords (${d.lat}, ${d.lng})`)
    continue
  }

  const src = srcOf(raw)
  const coords = extractCoords(src)

  if (coords) {
    bySource[coords.source] = (bySource[coords.source] || 0) + 1
    const found = `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} [${coords.source}]`
    if (APPLY) {
      const { error: upErr } = await db.from('dentists').update({ lat: coords.lat, lng: coords.lng }).eq('id', d.id)
      if (upErr) { failed++; console.log(`FAIL          ${name} ${upErr.message}`) }
      else { updated++; console.log(`DONE          ${name} ${found}`) }
    } else {
      updated++
      console.log(`WOULD UPDATE  ${name} ${found}`)
    }
    continue
  }

  if (CID_RE.test(src)) { needsGeocode++; console.log(`NEEDS_GEOCODE ${name} (CID only — no coords)`); continue }
  if (PLACE_RE.test(src)) { needsGeocode++; console.log(`NEEDS_GEOCODE ${name} (place-name only — no coords)`); continue }
  needsGeocode++
  console.log(`NEEDS_GEOCODE ${name} (unrecognised embed — no coords)`)
}

console.log(`\n${APPLY ? 'Applied' : 'Dry-run'} summary:`)
console.log(`  ${APPLY ? 'updated' : 'would update'}: ${updated}${Object.keys(bySource).length ? '  (' + Object.entries(bySource).map(([s, c]) => `${s}:${c}`).join(', ') + ')' : ''}`)
console.log(`  needs geocode:  ${needsGeocode}`)
console.log(`  already set:    ${alreadySet}`)
console.log(`  skipped empty:  ${skipped}`)
if (failed) console.log(`  failed:         ${failed}`)
if (!APPLY && updated > 0) console.log('\nRe-run with --apply to write these coordinates.')
