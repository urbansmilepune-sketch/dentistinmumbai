// /review/[token] — the page a patient opens from the "rate your visit"
// WhatsApp. The token is the proof they were sent the link, so there is no
// OTP: tap stars, tap tags, optional text, submit. Not indexed.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import { NAVY, TEAL_DARK, normalizeDrName, initialsFrom } from '@/app/dentist/[slug]/profileTheme'
import { firstName, GOOD_TAGS, BAD_TAGS } from '@/lib/reviewRequests'
import ReviewByLinkForm from './ReviewByLinkForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rate your visit | DentistIn',
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ token: string }>
}

function formatVisit(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default async function ReviewByLinkPage({ params }: Props) {
  const { token } = await params
  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const valid = /^[A-Za-z0-9_-]{16,64}$/.test(token)
  const { data: req } = valid
    ? await db
        .from('review_requests')
        .select('id, patient_name, treatment, visit_date, used_at, opened_at, expires_at, dentists(name, clinic_name, slug, city, profile_photo, areas(name))')
        .eq('token', token)
        .maybeSingle()
    : { data: null }

  const d: any = req ? (Array.isArray((req as any).dentists) ? (req as any).dentists[0] : (req as any).dentists) : null
  const city = getCityBySlug(d?.city)
  const profileHref = d?.slug ? `${cityOrigin(city)}/dentist/${d.slug}` : '/'

  let state: 'ok' | 'used' | 'expired' | 'invalid' = 'invalid'
  if (req && d) {
    if (req.used_at) state = 'used'
    else if (Date.parse(req.expires_at) < Date.now()) state = 'expired'
    else state = 'ok'
  }

  if (req && !req.opened_at) {
    await db.from('review_requests').update({ opened_at: new Date().toISOString() }).eq('id', req.id)
  }

  const drName = d ? normalizeDrName(d.name) : ''
  const visitBits = [formatVisit(req?.visit_date ?? null), req?.treatment].filter(Boolean).join(' · ')

  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: '100vh', background: '#F8FAFC', color: NAVY, fontFamily: 'var(--font-body)' }}>
      <div style={{ background: NAVY, color: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>Dentist<span style={{ color: '#2DD4BF' }}>In</span></span>
        <span style={{ fontSize: 12, color: '#CBD5E1' }}>{city.cityName}</span>
      </div>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '18px 18px 0' }}>{children}</div>
    </main>
  )

  if (state !== 'ok') {
    const msg = state === 'used'
      ? { h: 'You have already rated this visit', p: 'Thank you. Your review is with our team and shows on the profile once checked.' }
      : state === 'expired'
        ? { h: 'This link has expired', p: 'Review links work for 30 days after a visit.' }
        : { h: 'This link does not work', p: 'Please check you opened the full link from your WhatsApp message.' }
    return shell(
      <div style={{ textAlign: 'center', padding: '48px 8px', display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800 }}>{msg.h}</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#475569' }}>{msg.p}</p>
        {d?.slug && (
          <Link href={profileHref} style={{ justifySelf: 'center', marginTop: 8, minHeight: 46, padding: '0 20px', display: 'inline-flex', alignItems: 'center', borderRadius: 12, border: '1.5px solid #CBD5E1', background: '#fff', color: NAVY, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            See {drName}&apos;s profile
          </Link>
        )}
      </div>,
    )
  }

  return shell(
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 12 }}>
        {d.profile_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.profile_photo} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: '50%', background: '#CCFBF1', color: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{initialsFrom(d.name)}</span>
        )}
        <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
          <b style={{ fontSize: 16 }}>{drName}</b>
          <span style={{ fontSize: 13, color: '#475569' }}>{d.clinic_name}{d.areas?.name ? `, ${d.areas.name}` : ''}</span>
          {visitBits && <span style={{ fontSize: 12, color: TEAL_DARK, fontWeight: 600 }}>Your visit: {visitBits}</span>}
        </div>
      </div>
      <ReviewByLinkForm
        token={token}
        patientFirstName={firstName(req!.patient_name)}
        drName={drName}
        goodTags={[...GOOD_TAGS]}
        badTags={[...BAD_TAGS]}
        profileHref={profileHref}
      />
    </>,
  )
}
