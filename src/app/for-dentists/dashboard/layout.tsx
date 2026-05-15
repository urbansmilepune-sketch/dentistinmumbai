import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/for-dentists/login')

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, slug, name, clinic_name, tier, is_active, profile_photo, cover_photo, bio, whatsapp, maps_embed, city')
    .eq('email', user.email)
    .single()

  if (!dentist) {
    const email = user.email ?? ''
    redirect(`/for-dentists/register?email=${encodeURIComponent(email)}`)
  }
  if (!dentist.is_active) redirect('/for-dentists/pending')

  // Profile completion
  const checks = [
    !!dentist.profile_photo,
    !!dentist.cover_photo,
    !!(dentist.bio && dentist.bio.length >= 50),
    !!dentist.whatsapp,
    !!dentist.maps_embed,
  ]
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  return (
    <DashboardShell dentist={dentist} completionPct={pct}>
      {children}
    </DashboardShell>
  )
}
