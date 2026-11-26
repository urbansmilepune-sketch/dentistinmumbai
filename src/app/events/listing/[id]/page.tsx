import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { adminDb, isNationalRequest, ui } from '@/lib/national'
import { rupees } from '@/lib/eventPricing'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your listing | DentistIn India',
  robots: { index: false, follow: false },
}

// /events/listing/<id> — status of one submitted event or course: paid,
// being checked, live, alerts sent. The id is a random UUID only the
// submitter gets (email + after payment), so the page shows no contact data.

type Step = { label: string; detail: string; state: 'done' | 'now' | 'next' }

export default async function ListingStatusPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isNationalRequest())) notFound()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { data: ev } = await adminDb().from('events').select('*').eq('id', id).maybeSingle()
  if (!ev) notFound()
  const e = ev as Record<string, any>
  const featured = e.plan === 'featured'
  const paid = e.payment_status === 'paid'
  const live = e.status === 'approved'
  const rejected = e.status === 'rejected'

  const steps: Step[] = []
  if (featured) {
    steps.push(paid
      ? { label: 'Payment received', detail: `${rupees(e.amount_rupees || 0)} paid. Receipt sent to your email.`, state: 'done' }
      : e.payment_status === 'refund_due' || e.payment_status === 'refunded'
        ? { label: 'Refund', detail: e.payment_status === 'refunded' ? 'Your payment has been refunded.' : 'We are refunding your payment.', state: 'done' }
        : { label: 'Payment pending', detail: `${rupees(e.amount_rupees || 0)} for Featured. ${e.payment_link_url ? 'Pay with the button below.' : 'We’ll email you a payment link after we check the details.'}`, state: 'now' })
  }
  steps.push(rejected
    ? { label: 'Not approved', detail: 'We could not list this one. Reply to our email if you have questions.', state: 'done' }
    : live
      ? { label: 'Checked', detail: 'Our team confirmed the details.', state: 'done' }
      : { label: 'Being checked', detail: 'We confirm the dates and link, usually within a day.', state: featured && !paid ? 'next' : 'now' })
  if (!rejected) steps.push(live
    ? { label: 'Live on DentistIn India', detail: 'Share the link below with your attendees.', state: 'done' }
    : { label: 'Live on DentistIn India', detail: 'We’ll email you the link.', state: 'next' })
  if (featured && !rejected) steps.push(e.alert_live_sent_at
    ? { label: 'Dentists alerted', detail: `Email and WhatsApp sent${e.alert_reminder_sent_at ? ', and the 2-day reminder too' : '. A reminder goes 2 days before the event'}.`, state: 'done' }
    : { label: 'Dentists alerted', detail: `Email and WhatsApp to about ${e.alert_dentists || 0} dentists ${e.feature_all_india ? 'across India' : 'in your chosen cities'}, when it goes live and 2 days before the event.`, state: 'next' })

  const dot = (s: Step['state']): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0,
    background: s === 'done' ? '#047857' : s === 'now' ? '#F59E0B' : '#E2E8F0', color: s === 'done' ? '#fff' : s === 'now' ? '#1F1300' : '#475569',
  })

  return (
    <NationalShell>
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px 64px' }}>
        <h1 style={ui.h1}>{e.title}</h1>
        <p style={{ ...ui.sub, marginBottom: 16 }}>{featured ? 'Featured listing' : 'Standard listing'} · {e.kind === 'course' ? 'Course' : 'Event'}</p>
        <div style={{ ...ui.card, padding: '4px 16px', marginBottom: 16 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i ? '1px solid #E2E8F0' : 'none' }}>
              <div style={dot(s.state)}>{s.state === 'done' ? '✓' : i + 1}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
        {featured && !paid && e.payment_status === 'pending' && e.payment_link_url && !rejected && (
          <a href={e.payment_link_url} style={{ ...ui.btn, width: '100%', marginBottom: 10 }}>Pay {rupees(e.amount_rupees || 0)} now</a>
        )}
        {live && <Link href={`/events?e=${e.id}#ev-${e.id}`} style={{ ...ui.btnGhost, width: '100%' }}>See it on the Events page</Link>}
        {!live && <Link href="/events" style={{ ...ui.btnGhost, width: '100%' }}>Back to events</Link>}
      </main>
    </NationalShell>
  )
}
