import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import NationalShell from '@/components/national/NationalShell'
import { isNationalHost, NATIONAL_ORIGIN } from '@/config/cities'

// /vendors — the lab and vendor directory. This is the destination the new
// national homepage nav ("Find a Lab") and hero CTA ("Find a lab near you")
// point at, so it has to resolve today even though the feature itself is
// still to be built.
//
// Placeholder for now: honest about not being live yet, and routes the
// dentist to the one thing that IS actionable — claiming their profile, which
// is step 1 of the flow regardless. Replaced wholesale by the real
// search/list surface once the vendors + vendor_mentions tables land.
//
// noindex: there's nothing to rank on an empty-state page, and we don't want
// it competing with the homepage for "dental lab" queries before it has any
// real inventory behind it.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Find a Dental Lab You Can Trust | Dentist In India',
  description: 'Lab, distributor and equipment-technician ratings from verified dentists across India.',
  alternates: { canonical: `${NATIONAL_ORIGIN}/vendors` },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default async function VendorsPage() {
  // National-only surface. City domains have their own patient-facing shape
  // and no vendor directory, so send them home rather than rendering the
  // national shell on a city host.
  const h = await headers()
  const national =
    h.get('x-is-national') === '1' || isNationalHost(h.get('x-forwarded-host') || h.get('host'))
  if (!national) redirect('/')

  return (
    <NationalShell badge="Find a Lab">
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 20px 80px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>🔬</div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34, lineHeight: 1.15, color: '#0F1923', marginBottom: 14 }}>
          Lab ratings are coming
        </h1>
        <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.65, marginBottom: 28 }}>
          We&apos;re building a directory of dental labs, distributors and equipment technicians — ranked by
          verified dentists who&apos;ve actually used them, not by who paid for placement.
        </p>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px 22px', textAlign: 'left', marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            How you can help
          </div>
          <p style={{ fontSize: 14.5, color: '#475569', lineHeight: 1.7, margin: 0 }}>
            The directory is only as good as the dentists in it. Claim your verified profile now and
            you&apos;ll be able to rate the labs you already work with the day this opens — and see what
            everyone else in your city is saying.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/join" style={{ padding: '13px 24px', minHeight: 46, background: '#1D4ED8', color: '#fff', borderRadius: 10, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}>
            Claim your profile →
          </Link>
          <Link href="/for-dentists/login" style={{ padding: '13px 24px', minHeight: 46, background: '#fff', color: '#0F1923', border: '1.5px solid #0F1923', borderRadius: 10, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </main>
    </NationalShell>
  )
}
