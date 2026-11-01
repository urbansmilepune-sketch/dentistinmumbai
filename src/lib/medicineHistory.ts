// Medicines a dentist has prescribed before, built from their own
// `prescriptions` rows. Used to auto-complete the medicine name while writing
// a new prescription, and to refill the dose/frequency/duration they used last.
//
// Two forms write prescriptions with slightly different shapes:
//   - patient file form: { name: 'Amoxicillin 500mg', dosage: '1-0-1', duration, instructions }
//   - visit screen:      { name: 'Amoxicillin', dosage: '500 mg', frequency: '1-0-1', duration, instructions }
// We keep whatever was saved last for each name and let the caller decide how
// to lay it out.

import type { SupabaseClient } from '@supabase/supabase-js'

export type PastMedicine = {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  /** How many prescriptions included this medicine. */
  count: number
  /** created_at of the latest prescription that used it (ISO). */
  lastUsed: string
}

type RxRow = { medicines?: unknown; created_at?: string | null }

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const keyOf = (name: string) => clean(name).toLowerCase()

/**
 * Collapse prescription rows into one entry per medicine name (case and
 * spacing ignored). Rows can come in any order; the details of the most
 * recent use win.
 */
export function buildMedicineHistory(rows: RxRow[]): PastMedicine[] {
  const map = new Map<string, PastMedicine>()
  for (const row of rows || []) {
    const meds = Array.isArray(row?.medicines) ? row.medicines : []
    const at = String(row?.created_at || '')
    // Count a medicine once per prescription even if it was listed twice.
    const seen = new Set<string>()
    for (const m of meds as Array<Record<string, unknown> | null>) {
      const name = clean(m?.name)
      if (!name) continue
      const key = keyOf(name)
      const prev = map.get(key)
      const counted = seen.has(key)
      seen.add(key)
      if (!prev) {
        map.set(key, {
          name, dosage: clean(m?.dosage), frequency: clean(m?.frequency), duration: clean(m?.duration),
          instructions: clean(m?.instructions), count: 1, lastUsed: at,
        })
        continue
      }
      if (!counted) prev.count += 1
      if (at > prev.lastUsed) {
        Object.assign(prev, {
          name, dosage: clean(m?.dosage), frequency: clean(m?.frequency), duration: clean(m?.duration),
          instructions: clean(m?.instructions), lastUsed: at,
        })
      }
    }
  }
  return sortByUse([...map.values()])
}

function sortByUse(list: PastMedicine[]): PastMedicine[] {
  return list.sort((a, b) => b.count - a.count || (b.lastUsed > a.lastUsed ? 1 : b.lastUsed < a.lastUsed ? -1 : 0) || a.name.localeCompare(b.name))
}

/**
 * Filter the history for what the dentist has typed so far. Names that start
 * with the text come first, then names with a word starting with it, then
 * (from 4 letters on) names that contain it anywhere. Within each group the most used come first.
 * An empty query returns the most used medicines.
 */
export function matchMedicines(history: PastMedicine[], query: string, max = 6): PastMedicine[] {
  const q = keyOf(query)
  if (!q) return history.slice(0, max)
  const ranked: { m: PastMedicine; rank: number; i: number }[] = []
  history.forEach((m, i) => {
    const n = keyOf(m.name)
    if (n === q) return // already typed in full, nothing to suggest
    let rank = -1
    if (n.startsWith(q)) rank = 0
    else if (n.split(/[\s+\-/(),]+/).some(w => w.startsWith(q))) rank = 1
    // Mid-word matches only from 4 letters, so "amo" doesn't pull up Paracetamol.
    else if (q.length >= 4 && n.includes(q)) rank = 2
    if (rank >= 0) ranked.push({ m, rank, i })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, max).map(r => r.m)
}

/** "500 mg · 1-0-1 · 5 days" — the details shown under a suggestion. */
export function pastMedicineDetails(m: PastMedicine): string {
  return [m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')
}

/**
 * Load this dentist's latest prescriptions (newest first, up to 1000 rows, the
 * PostgREST cap) and build the history. Returns [] on any error so the form
 * keeps working as a plain text box.
 */
export async function fetchMedicineHistory(supabase: SupabaseClient, dentistId: string): Promise<PastMedicine[]> {
  if (!dentistId) return []
  const { data, error } = await supabase
    .from('prescriptions')
    .select('medicines, created_at')
    .eq('dentist_id', dentistId)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error || !data) return []
  return buildMedicineHistory(data as RxRow[])
}
