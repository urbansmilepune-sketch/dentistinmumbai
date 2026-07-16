// Schema drift audit: compares every `create table` in supabase/migrations/*.sql
// against the LIVE database via PostgREST, so we catch migrations that were
// written but never applied (the repo's migrations are reconstructed no-ops —
// the CLI can't push — so drift is easy to introduce).
//
// Usage:
//   node --env-file=.env.local scripts/schema-audit.mjs
//
// Env (read from process.env; --env-file loads .env.local into it):
//   SUPABASE_URL       (falls back to NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_ANON_KEY  (falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY)
// The anon key is sufficient: a missing table returns 404/PGRST205, while an
// RLS-protected-but-present table still returns 200 with an empty row set.

import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

// Spec names first, then the NEXT_PUBLIC_* names that actually live in .env.local.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing env. Set SUPABASE_URL and SUPABASE_ANON_KEY (or the NEXT_PUBLIC_ equivalents).')
  console.error('Run: node --env-file=.env.local scripts/schema-audit.mjs')
  process.exit(2)
}

const base = SUPABASE_URL.replace(/\/+$/, '')

// Matches: create table [if not exists] [public.]<name>, any case, quoted or not.
const CREATE_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi

// Strip SQL comments first — otherwise prose like a line-wrapped
// "`create table if not\n-- exists`" inside a comment is mis-parsed as a real
// statement (the `--` breaks the "if not exists" span, capturing "if").
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* block */
    .replace(/--[^\n]*/g, '')          // -- line
}

async function collectTables() {
  const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort()
  const tables = new Set()
  for (const file of files) {
    const sql = stripSqlComments(await readFile(join(MIGRATIONS_DIR, file), 'utf8'))
    for (const m of sql.matchAll(CREATE_TABLE_RE)) tables.add(m[1])
  }
  return [...tables].sort()
}

async function tableExists(table) {
  const url = `${base}/rest/v1/${table}?limit=0`
  let res
  try {
    res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
  } catch (err) {
    return { ok: false, note: `request failed: ${err.message}` }
  }
  // 200 = present (rows or empty), 406 = present but content-negotiation quirk.
  if (res.status === 200 || res.status === 406) return { ok: true }
  // 404 = relation not found; PGRST205 is PostgREST's "table not in schema cache".
  if (res.status === 404) return { ok: false, note: 'MISSING — apply migration' }
  const body = await res.text().catch(() => '')
  if (body.includes('PGRST205')) return { ok: false, note: 'MISSING — apply migration' }
  return { ok: false, note: `unexpected status ${res.status}` }
}

async function main() {
  const tables = await collectTables()
  console.log(`Auditing ${tables.length} table(s) from migrations against ${base}\n`)

  let missing = 0
  for (const table of tables) {
    const { ok, note } = await tableExists(table)
    if (ok) {
      console.log(`✅ ${table}`)
    } else {
      missing++
      console.log(`❌ ${table} (${note})`)
    }
  }

  console.log(`\n${missing} of ${tables.length} table(s) missing.`)
  // Non-zero exit when drift is found, so this is CI-friendly.
  process.exit(missing > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
