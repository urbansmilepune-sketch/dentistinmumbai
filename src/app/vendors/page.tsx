import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import NationalShell from '@/components/national/NationalShell'
import { isNationalHost, NATIONAL_ORIGIN } from '@/config/cities'

// /vendors — lab and vendor discovery.
//
// Deliberately a secondary utility, not a headline feature: it is reachable
// from the footer's "For your practice" column and (once built) the dentist
// dashboard, and from nowhere else. It is NOT in the primary nav and NOT in
// the homepage hero — the product is clinical case review between dentists.
//
// Placeholder until the minimal directory + suggest-a-vendor form is built
// against the vendors / vendor_mentions tables.
//
// noindex: nothing to rank on an empty-state page, and it shouldn't compete
// with the homepage for "dental lab" queries before it has real inventory.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Labs & Vendors | Dentist In India',
  description: 'Lab, distributor and equipment-technician recommendations from verified dentists across India.',
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
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, lineHeight: 1.18, color: '#0F1923', marginBottom: 14 }}>
          Labs and vendors, coming soon
        </h1>
        <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.65, marginBottom: 28 }}>
          A small directory of dental labs, distributors and equipment technicians — recommended by
          verified dentists who&apos;ve actually used them, not by who paid for placement. A practical
          side-utility, not the main event.
        </p>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px 22px', textAlign: 'left', marginBottom: 28 }}>
          <p style={{ fontSize: 14.5, color: '#475569', lineHeight: 1.7, margin: 0 }}>
            It only works if the recommendations come from real dentists. Claim your verified profile
            and you&apos;ll be able to add the labs you already work with when this opens.
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
