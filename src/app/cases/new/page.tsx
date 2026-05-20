import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NationalShell from '@/components/national/NationalShell'
import CaseForm from './CaseForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Post a Clinical Case | Dentist In India',
  description: 'Share a verified clinical case with the dental community on Dentist In India.',
  robots: { index: false, follow: false },
}

export default async function NewCasePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Not logged in → bounce to login with a next= so they come back here
  // after sign-in. We don't redirect to /for-dentists/dashboard the way
  // the city flows do because that would dump them into a Mumbai-branded
  // dashboard instead of returning to the case form they were filling out.
  if (!user?.email) redirect('/for-dentists/login?next=/cases/new')

  // The auth row maps to a dentist row by email; if missing, the visitor
  // is signed in but has never registered as a dentist — punt them to
  // registration so we don't pretend they can post.
  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, name, slug, is_active, is_verified')
    .eq('email', user.email)
    .single()
  if (!dentist) redirect('/for-dentists/register')
  if (!dentist.is_active) redirect('/for-dentists/pending')

  return (
    <NationalShell badge="Post a Case">
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 20px 64px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, color: '#0F1923', marginBottom: 8 }}>
            Post a clinical case
          </h1>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
            Share a treatment for the dental community to review. Your first three submissions need admin approval; everything after that goes live automatically.
          </p>
        </header>
        <CaseForm dentistName={dentist.name} isVerified={!!dentist.is_verified} />
      </main>
    </NationalShell>
  )
}
