// Universal-treatment seeding — shared by every code path that creates a
// dentists row:
//   - src/lib/approval.ts            (admin "Approve" in the panel)
//   - POST /api/registrations        (instant-on email+password signup)
//   - POST /api/onboard              (instant-on Google claim-your-listing)
// so a new dentist's profile and the city treatment pages are never empty on
// day one. Specialist treatments (implants, braces, aligners…) stay manual on
// purpose — see src/config/universalTreatments.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { UNIVERSAL_TREATMENT_SLUGS } from '@/config/universalTreatments'

/** Best-effort: attach the universal treatments (cleaning, root canal, etc.)
 * to a dentist so their profile and the city treatment pages have content from
 * day one. Idempotent — inserts only the universals the dentist doesn't already
 * have, so re-approval / re-runs / double-submits never duplicate (this holds
 * with or without the optional unique index). Never throws: the dentist row is
 * already live, so a seeding hiccup just logs rather than failing the caller. */
export async function seedUniversalTreatments(admin_db: SupabaseClient, dentistId: string, tag: string): Promise<void> {
  try {
    const { data: txRows, error: txErr } = await admin_db
      .from('treatments')
      .select('id')
      .in('slug', [...UNIVERSAL_TREATMENT_SLUGS])
    if (txErr || !txRows || txRows.length === 0) {
      console.error(`${tag} universal-treatment lookup failed`, txErr)
      return
    }
    const { data: existingLinks } = await admin_db
      .from('dentist_treatments')
      .select('treatment_id')
      .eq('dentist_id', dentistId)
    const have = new Set((existingLinks ?? []).map(r => r.treatment_id))
    const toInsert = txRows
      .filter(t => !have.has(t.id))
      .map(t => ({ dentist_id: dentistId, treatment_id: t.id, fee_from: null, fee_to: null }))
    if (toInsert.length === 0) return
    const { error: insErr } = await admin_db.from('dentist_treatments').insert(toInsert)
    if (insErr) console.error(`${tag} universal-treatment seed failed`, insErr)
    else console.log(`${tag} seeded ${toInsert.length} universal treatment(s)`, { dentistId })
  } catch (err) {
    console.error(`${tag} universal-treatment seed threw`, err)
  }
}
