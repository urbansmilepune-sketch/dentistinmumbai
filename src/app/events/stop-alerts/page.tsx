import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { isNationalRequest, ui } from '@/lib/national'
import StopAlertsButton from './StopAlertsButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Stop event alerts | DentistIn India',
  robots: { index: false, follow: false },
}

// Linked from every event alert email. One tap turns alerts off. The tap is
// a POST (not the link itself) so email scanners that open links don't
// switch anyone off by accident.
export default async function StopAlertsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  if (!(await isNationalRequest())) notFound()
  const { t } = await searchParams
  return (
    <NationalShell>
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px 64px' }}>
        <h1 style={ui.h1}>Stop event alerts</h1>
        <p style={{ ...ui.sub, marginBottom: 18 }}>You won&apos;t get emails or WhatsApp messages about Featured events and courses any more. Everything else from DentistIn stays the same.</p>
        <StopAlertsButton token={t || ''} />
      </main>
    </NationalShell>
  )
}
