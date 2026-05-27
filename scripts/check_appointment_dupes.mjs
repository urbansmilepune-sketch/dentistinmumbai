#!/usr/bin/env node
// One-off audit: are there any non-cancelled appointments that would
// collide with the appointments_slot_unique partial index before we add
// it? Read-only — only SELECTs, no writes.
//
// Mirrors the index key:
//   (dentist_id, appt_date, time_slot, coalesce(location_id, sentinel))
//   WHERE status <> 'cancelled'
//
// Run from repo root:  node scripts/check_appointment_dupes.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

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

const SENTINEL = '00000000-0000-0000-0000-000000000000'
const db = createClient(url, key)

console.log('Fetching non-cancelled appointments…')

// Page through every non-cancelled row. REST caps at 1000/req by default;
// loop until we run out.
const rows = []
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from('appointments')
    .select('id, dentist_id, appt_date, time_slot, location_id, status, created_at')
    .neq('status', 'cancelled')
    .range(from, from + PAGE - 1)
  if (error) {
    console.error('Query failed:', error)
    process.exit(1)
  }
  if (!data || data.length === 0) break
  rows.push(...data)
  if (data.length < PAGE) break
}

console.log(`Scanned ${rows.length} non-cancelled appointments.`)

const buckets = new Map()
for (const r of rows) {
  const loc = r.location_id || SENTINEL
  const key = `${r.dentist_id}|${r.appt_date}|${r.time_slot}|${loc}`
  const list = buckets.get(key) ?? []
  list.push(r)
  buckets.set(key, list)
}

const dupes = [...buckets.entries()].filter(([, list]) => list.length > 1)
console.log(`Found ${dupes.length} duplicate slot bucket(s).`)

if (dupes.length === 0) {
  console.log('\n✅ Safe to apply 20260527140000_appointments_slot_unique.sql — no collisions.')
  process.exit(0)
}

console.log('\n❌ Collisions exist — the unique index will FAIL to create until these are resolved.\n')
for (const [k, list] of dupes.slice(0, 50)) {
  const [d, date, slot, loc] = k.split('|')
  console.log(`  dentist=${d.slice(0, 8)}…  date=${date}  slot=${slot}  loc=${loc === SENTINEL ? '<none>' : loc.slice(0, 8) + '…'}`)
  for (const r of list) {
    console.log(`    appt ${r.id.slice(0, 8)}…  status=${r.status}  created_at=${r.created_at}`)
  }
}
if (dupes.length > 50) console.log(`  …and ${dupes.length - 50} more.`)
process.exit(1)
