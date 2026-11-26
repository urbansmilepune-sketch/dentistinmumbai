import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb, getViewerDentist } from '@/lib/national'
import { loadDentistHome } from '@/lib/dentistHome'
import { REMEMBER_COOKIE } from '@/lib/auth/rememberMe'
import NationalLanding from './home/NationalLanding'
import DentistHome from './home/DentistHome'

// dentistinindia.in homepage (redesigned from Ashish's sketch, Nov 2026).
//
// Signed out: India map, "India's first social platform for dentists", the
// dentist login box, "Register your profile" and a public strip with links
// to every live city site (so Google still sees real content and the city
// domains). Signed in: the dentist home, with the Post wall, community feed
// and "Manage my clinic" (one-tap sign-in to their city-site dashboard).
//
// Booking stays on the city sites. Numbers shown are live counts.

export const dynamic = 'force-dynamic'

export default async function NationalHome() {
  const viewer = await getViewerDentist()
  if (viewer) {
    const data = await loadDentistHome(viewer.id)
    if (data) return <DentistHome data={data} />
  } else if ((await cookies()).get(REMEMBER_COOKIE)?.value) {
    // 30-day "remember me": sign them back in silently, then come back here.
    // On failure that route clears the cookie, so this can't loop.
    redirect('/api/auth/remember-me?next=%2F')
  }

  const db = adminDb()
  const [dentistsRes, casesRes] = await Promise.all([
    db.from('dentists').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('cases').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
  ])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${NATIONAL_ORIGIN}/#organization`, name: 'DentistIn', url: NATIONAL_ORIGIN, logo: `${NATIONAL_ORIGIN}/logo-india.webp`, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
      { '@type': 'WebSite', '@id': `${NATIONAL_ORIGIN}/#website`, name: 'Dentist In India', url: NATIONAL_ORIGIN, publisher: { '@id': `${NATIONAL_ORIGIN}/#organization` }, inLanguage: 'en-IN' },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NationalLanding dentistCount={dentistsRes.count ?? 0} caseCount={casesRes.count ?? 0} />
    </>
  )
}
