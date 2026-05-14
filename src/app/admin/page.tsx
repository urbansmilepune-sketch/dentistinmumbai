import { createClient } from '@/lib/supabase/server'
import AdminPageClient from './AdminPageClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  const [
    { count: dentistCount },
    { count: appointmentCount },
    { count: enquiryCount },
    { data: dentists },
    { data: registrations },
    { data: appointments },
    { data: enquiries },
    { data: reviews },
    { data: areas },
    { data: foundingConfig },
    { data: reviewPending },
    { data: pendingRegs },
  ] = await Promise.all([
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('appointments').select('*', { count: 'exact', head: true }),
    supabase.from('enquiries').select('*', { count: 'exact', head: true }),
    supabase.from('dentists').select('id, slug, name, clinic_name, qualifications, phone, tier, is_verified, is_active, areas(name, slug)').order('created_at', { ascending: false }).limit(100),
    supabase.from('dentist_registrations').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('appointments').select('*, dentists(name), treatments(name)').order('created_at', { ascending: false }).limit(50),
    supabase.from('enquiries').select('*, dentists(name)').order('created_at', { ascending: false }).limit(50),
    supabase.from('reviews').select('*, dentists(name, clinic_name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('areas').select('*').order('zone').order('name'),
    supabase.from('founding_config').select('*').eq('id', 1).single(),
    supabase.from('reviews').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
    supabase.from('dentist_registrations').select('id', { count: 'exact', head: false }).eq('status', 'pending'),
  ])

  const dc = dentistCount || 0
  const stats = {
    dentistCount: dc,
    appointmentCount: appointmentCount || 0,
    enquiryCount: enquiryCount || 0,
    reviewPendingCount: reviewPending?.length || 0,
    registrationCount: pendingRegs?.length || 0,
    foundingPct: Math.min((dc / 250) * 100, 100),
  }

  return (
    <AdminPageClient
      stats={stats}
      dentists={dentists || []}
      registrations={registrations || []}
      appointments={appointments || []}
      enquiries={enquiries || []}
      reviews={reviews || []}
      areas={areas || []}
      foundingConfig={foundingConfig}
    />
  )
}
