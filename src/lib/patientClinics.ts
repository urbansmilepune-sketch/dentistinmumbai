// Server-only: every clinic where this patient login (phone or email) is on
// file, one entry per patient row. Used after SMS/email code login, Google
// login, and by /api/patient/session to rebuild the clinic list.
import type { SupabaseClient } from '@supabase/supabase-js'
import { patientMatch, type PatientPortalClaims } from '@/lib/patientPortal'

export interface ClinicForPatient {
  patient_id: string
  patient_name: string | null
  dentist_id: string | null
  dentist_name: string | null
  clinic_name: string | null
  city: string | null
}

export async function loadClinicsFor(db: SupabaseClient, who: PatientPortalClaims): Promise<{ clinics: ClinicForPatient[]; error: string | null }> {
  const match = patientMatch(who)
  const { data, error } = await db
    .from('patients')
    .select('id, name, dentist:dentists(id, name, clinic_name, city)')
    .ilike(match.column, match.pattern)
  if (error) return { clinics: [], error: error.message }
  const clinics = (data || []).map((r: any) => ({
    patient_id: r.id,
    patient_name: r.name ?? null,
    dentist_id: r.dentist?.id ?? null,
    dentist_name: r.dentist?.name ?? null,
    clinic_name: r.dentist?.clinic_name ?? null,
    city: r.dentist?.city ?? null,
  }))
  if (clinics.length) {
    // Last-login stamp, best effort.
    await db.from('patients').update({ portal_last_login: new Date().toISOString() }).in('id', clinics.map(c => c.patient_id))
  }
  return { clinics, error: null }
}
