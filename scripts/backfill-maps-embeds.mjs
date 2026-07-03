#!/usr/bin/env node
// Backfill: expand raw Google Maps URLs already saved in dentists.maps_embed
// into renderable iframes, matching the server route's logic. Rows that are
// already an <iframe> are left alone.
//
// Usage:
//   node scripts/backfill-maps-embeds.mjs            # dry-run (default)
//   node scripts/backfill-maps-embeds.mjs --apply    # write changes
//
// Reads Supabase credentials from .env.local (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY) and uses the service-role client, so it bypasses
// RLS. GOOGLE_MAPS_EMBED_API_KEY is honoured if present.
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
const EMBED_KEY = fileEnv.GOOGLE_MAPS_EMBED_API_KEY || process.env.GOOGLE_MAPS_EMBED_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local).')
  process.exit(1)
}

// Mirror of src/app/api/dentist/maps-embed/route.ts — keep the two in sync.
const FETCHABLE_HOST_RE = /^(?:maps\.app\.goo\.gl|(?:www\.)?google\.com|maps\.google\.com)$/i
const LATLNG_RE = /@(-?\d+\.\d+),(-?\d+\.\d+)/
const CID_RE = /!1s0x[0-9a-f]+:0x([0-9a-f]+)/i
const PLACE_RE = /\/maps\/place\/([^/?@]+)/i
const IFRAME_RE = /^<iframe[\s\S]*<\/iframe>\s*$/i

function isIframe(v) { return IFRAME_RE.test((v ?? '').trim()) }
function hostOf(u) { try { return new URL(u).host } catch { return null } }

function iframe(src) {
  return `<iframe src="${src}" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
}

function embedFromLatLng(lat, lng) {
  if (EMBED_KEY) return iframe(`https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(EMBED_KEY)}&center=${lat},${lng}&zoom=16`)
  return iframe(`https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed&hl=en`)
}

function embedFromPlaceName(name) {
  const q = encodeURIComponent(name)
  if (EMBED_KEY) return iframe(`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(EMBED_KEY)}&q=${q}`)
  return iframe(`https://maps.google.com/maps?q=${q}&output=embed&hl=en`)
}

function embedFromResolvedUrl(url) {
  const ll = url.match(LATLNG_RE)
  if (ll) return embedFromLatLng(ll[1], ll[2])
  if (!EMBED_KEY) {
    const cid = url.match(CID_RE)
    if (cid) return iframe(`https://maps.google.com/maps?cid=${BigInt('0x' + cid[1]).toString()}&output=embed&hl=en`)
  }
  const pm = url.match(PLACE_RE)
  if (pm) {
    try {
      const name = decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim()
      if (name) return embedFromPlaceName(name)
    } catch { /* fall through */ }
  }
  return null
}

async function expand(raw) {
  const input = (raw ?? '').trim()
  if (!input || isIframe(input)) return null
  let embed = embedFromResolvedUrl(input)
  if (!embed) {
    const host = hostOf(input)
    if (host && FETCHABLE_HOST_RE.test(host)) {
      try {
        const res = await fetch(input, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DentistInMumbaiBot/1.0)' },
        })
        embed = embedFromResolvedUrl(res.url || '')
      } catch { /* unresolved */ }
    }
  }
  return embed
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const { data, error } = await db
  .from('dentists')
  .select('id, slug, maps_embed')
  .not('maps_embed', 'is', null)
if (error) { console.error('Query failed:', error.message); process.exit(1) }

const candidates = (data ?? []).filter(d => d.maps_embed && d.maps_embed.trim() && !isIframe(d.maps_embed))
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | embed key: ${EMBED_KEY ? 'yes' : 'no (keyless)'}`)
console.log(`${candidates.length} dentist(s) with a raw (non-iframe) maps_embed.\n`)

let converted = 0, unresolved = 0, failed = 0
for (const d of candidates) {
  const embed = await expand(d.maps_embed)
  if (!embed) {
    unresolved++
    console.log(`SKIP   ${d.slug}: could not resolve → ${d.maps_embed.slice(0, 70)}`)
    continue
  }
  if (APPLY) {
    const { error: upErr } = await db.from('dentists').update({ maps_embed: embed }).eq('id', d.id)
    if (upErr) { failed++; console.log(`FAIL   ${d.slug}: ${upErr.message}`) }
    else { converted++; console.log(`DONE   ${d.slug}`) }
  } else {
    converted++
    console.log(`WOULD  ${d.slug}: ${embed.slice(0, 80)}...`)
  }
}

console.log(`\n${APPLY ? 'Applied' : 'Dry-run'}: ${converted} ${APPLY ? 'updated' : 'convertible'}, ${unresolved} unresolved${failed ? `, ${failed} failed` : ''}.`)
if (!APPLY && converted > 0) console.log('Re-run with --apply to write these changes.')
