import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import EditProfileClient from './EditProfileClient'

export const dynamic = 'force-dynamic'

// Admin-only dentist profile editor. Auth mirrors /admin/page.tsx: identity
// from the JWT, admin_users membership confirmed via the service-role client
// (so it doesn't depend on a self-read RLS policy), non-admins bounced to the
// dentist login so the admin surface stays hidden. Every data read uses the
// service-role client so RLS on the dentist's own row doesn't hide it from
// the admin.
export default async function AdminDentistEditPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login')

  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: adminRow } = await adminClient
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!adminRow) redirect('/for-dentists/login')

  const { id } = await params

  const { data: dentist } = await adminClient
    .from('dentists')
    .select('id, slug, name, clinic_name, email, is_active, tier, bio, qualifications, specialties, registration_number, experience_years, gender, area_id, phone, whatsapp, address, maps_embed, lat, lng, profile_photo, cover_photo, website, linkedin_url, working_hours, consultation_fee, languages, city')
    .eq('id', id)
    .maybeSingle()

  if (!dentist) {
    return (
      <div style={{ padding: 40, fontFamily: 'var(--font-body)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Dentist not found</h1>
        <p style={{ color: '#64748B', marginBottom: 16 }}>No dentist exists with id <code>{id}</code>.</p>
        <a href="/admin" style={{ color: '#1D4ED8', fontWeight: 600 }}>← Back to admin</a>
      </div>
    )
  }

  // Areas for the dentist's city power the location dropdown. Fall back to an
  // unfiltered list if the dentist has no city set so the dropdown is never
  // empty.
  const areasQuery = adminClient.from('areas').select('id, name, zone, city').order('zone').order('name')
  const { data: areas } = dentist.city
    ? await areasQuery.eq('city', dentist.city)
    : await areasQuery

  const [{ data: allTreatments }, { data: dentistTreatments }] = await Promise.all([
    adminClient.from('treatments').select('id, name, slug, icon').order('sort_order', { ascending: true, nullsFirst: false }).order('name'),
    adminClient.from('dentist_treatments').select('id, treatment_id, fee_from, fee_to, duration_mins').eq('dentist_id', id),
  ])

  return (
    <EditProfileClient
      dentist={dentist}
      areas={areas || []}
      allTreatments={allTreatments || []}
      dentistTreatments={dentistTreatments || []}
    />
  )
}
