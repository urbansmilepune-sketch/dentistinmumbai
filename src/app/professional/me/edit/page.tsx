import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NationalShell from '@/components/national/NationalShell'
import EditForm from './EditForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Edit professional profile | Dentist In India',
  robots: { index: false, follow: false },
}

export default async function EditProfessionalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login?next=/professional/me/edit')

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, slug, name, professional_bio, publications, hospital_affiliations')
    .eq('email', user.email)
    .single()
  if (!dentist) redirect('/for-dentists/register')

  return (
    <NationalShell badge="Edit Profile">
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 64px' }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: '#0F1923', marginBottom: 6 }}>Edit professional profile</h1>
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            These fields show on your public profile at <strong>/professional/{dentist.slug}</strong>. Patient-facing fields (name, clinic, photo) are still managed on your city dashboard.
          </p>
        </header>
        <EditForm
          slug={dentist.slug}
          initial={{
            professional_bio: dentist.professional_bio || '',
            publications: dentist.publications || '',
            hospital_affiliations: dentist.hospital_affiliations || '',
          }}
        />
      </main>
    </NationalShell>
  )
}
