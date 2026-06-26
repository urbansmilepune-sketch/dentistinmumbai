#!/usr/bin/env node
// Seed the 6 "universal" treatments (cleaning, root canal, extraction, crowns,
// whitening, fillings) to every ACTIVE dentist that currently has ZERO
// treatment links. One-time backfill + safe to re-run.
//
// Also ensures the `tooth-fillings` master treatment row exists (STEP 1) before
// seeding, placing it just after `teeth-cleaning` in sort order.
//
// Idempotent WITHOUT relying on a DB unique constraint: it only targets
// zero-link dentists, so a second run's target set excludes everyone the first
// run seeded. (If the optional unique index in
// supabase/migrations/20260626120000_dentist_treatments_unique.sql is applied,
// duplicate inserts are also rejected at the DB level — but we don't depend
// on it.)
//
// Dry-run by default. Pass --commit to actually write.
//   node scripts/seed-universal-treatments.mjs            # preview only, no writes
//   node scripts/seed-universal-treatments.mjs --commit   # write

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// KEEP IN SYNC with src/config/universalTreatments.ts
const UNIVERSAL_SLUGS = ['teeth-cleaning', 'root-canal', 'tooth-extraction', 'dental-crowns', 'teeth-whitening', 'tooth-fillings']
const FILLINGS = { slug: 'tooth-fillings', name: 'Tooth Fillings', icon: '🦷' }

const COMMIT = process.argv.includes('--commit')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(url, key)

console.log(`\n=== Seed universal treatments — ${COMMIT ? 'COMMIT (writing)' : 'DRY-RUN (no writes — pass --commit to write)'} ===\n`)

// Page through a table 1000 rows at a time (PostgREST default cap).
async function pageAll(table, select, applier) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(select).range(from, from + PAGE - 1)
    if (applier) q = applier(q)
    const { data, error } = await q
    if (error) { console.error(`Query ${table} failed:`, error); process.exit(1) }
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

// STEP 1 — ensure tooth-fillings exists in the master treatments table.
let { data: fillings } = await db.from('treatments').select('id, sort_order').eq('slug', FILLINGS.slug).maybeSingle()
if (!fillings) {
  const { data: cleaning } = await db.from('treatments').select('sort_order').eq('slug', 'teeth-cleaning').maybeSingle()
  const sort_order = (cleaning?.sort_order ?? 0) + 1
  if (COMMIT) {
    const { data: created, error } = await db.from('treatments')
      .insert({ name: FILLINGS.name, slug: FILLINGS.slug, icon: FILLINGS.icon, sort_order })
      .select('id, sort_order').single()
    if (error) { console.error('Failed to create tooth-fillings:', error); process.exit(1) }
    fillings = created
    console.log(`✓ Created master treatment "${FILLINGS.name}" (slug ${FILLINGS.slug}, sort_order ${sort_order})`)
  } else {
    console.log(`• Would create master treatment "${FILLINGS.name}" (slug ${FILLINGS.slug}, sort_order ${sort_order})`)
  }
} else {
  console.log(`✓ Master treatment "${FILLINGS.slug}" already exists`)
}

// STEP 2 — resolve the universal treatment ids.
const { data: txRows, error: txErr } = await db.from('treatments').select('id, slug').in('slug', UNIVERSAL_SLUGS)
if (txErr) { console.error('Treatment lookup failed:', txErr); process.exit(1) }
const foundSlugs = new Set((txRows || []).map(t => t.slug))
const missing = UNIVERSAL_SLUGS.filter(s => !foundSlugs.has(s))
if (missing.length) {
  if (!COMMIT && missing.length === 1 && missing[0] === FILLINGS.slug) {
    console.log(`• (${FILLINGS.slug} would be created on --commit; counting it as available for this preview)`)
  } else {
    console.error('✗ Missing universal treatments in master table:', missing)
    process.exit(1)
  }
}
const universalIds = (txRows || []).map(t => t.id)        // 5 in dry-run pre-fillings, 6 on --commit
const universalCount = COMMIT ? universalIds.length : UNIVERSAL_SLUGS.length
console.log(`Universal treatments (${universalCount}): ${UNIVERSAL_SLUGS.join(', ')}\n`)

// STEP 3 — find active dentists with zero treatment links.
const activeDentists = await pageAll('dentists', 'id', q => q.eq('is_active', true))
const links = await pageAll('dentist_treatments', 'dentist_id')
const linked = new Set(links.map(r => r.dentist_id))
const zeroLink = activeDentists.filter(d => !linked.has(d.id))

console.log(`Active dentists: ${activeDentists.length}`)
console.log(`  with ≥1 treatment link: ${activeDentists.length - zeroLink.length}`)
console.log(`  with ZERO links (seed targets): ${zeroLink.length}`)

const rowsToInsert = []
for (const d of zeroLink) {
  for (const tid of universalIds) {
    rowsToInsert.push({ dentist_id: d.id, treatment_id: tid, fee_from: null, fee_to: null })
  }
}
const projected = COMMIT ? rowsToInsert.length : zeroLink.length * universalCount
console.log(`Rows to insert: ${projected} (${zeroLink.length} dentists × ${universalCount} treatments)\n`)

if (!COMMIT) {
  console.log('DRY-RUN complete — nothing written. Re-run with --commit to seed.')
  process.exit(0)
}

// COMMIT — chunked insert.
const CHUNK = 500
let inserted = 0
for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
  const chunk = rowsToInsert.slice(i, i + CHUNK)
  const { error } = await db.from('dentist_treatments').insert(chunk)
  if (error) { console.error(`Insert chunk ${i}–${i + chunk.length} failed:`, error); process.exit(1) }
  inserted += chunk.length
  console.log(`  inserted ${inserted}/${rowsToInsert.length}…`)
}
console.log(`\n✅ Seeded ${inserted} rows across ${zeroLink.length} dentists.`)
process.exit(0)
