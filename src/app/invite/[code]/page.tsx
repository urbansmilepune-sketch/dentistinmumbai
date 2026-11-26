import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { drName } from '@/lib/dentistName'
import { cityNameOf, initialsOf, isNationalRequest, ui } from '@/lib/national'
import { findInviter, normalizeInviteCode } from '@/lib/invites'
import { loadExpertProfile, expertHeadline } from '@/lib/expertProfile'
import RememberInvite from './RememberInvite'

export const dynamic = 'force-dynamic'

// /invite/<CODE>: where a colleague lands from a dentist's "Invite on
// WhatsApp" link. Shows who invited them, remembers the code on this phone
// for 30 days and sends them to /join?ref=<CODE>, so the new dentist's
// `ref` is saved against the inviter.

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const norm = normalizeInviteCode(code)
  const d = norm ? await findInviter(norm) : null
  const title = d ? `Join ${drName(d.name)} on DentistIn India` : 'Join DentistIn India'
  const description = 'Real cases and second opinions from dentists across India, and a profile patients find when they search your name. Free.'
  const image = `${NATIONAL_ORIGIN}/api/og/invite/${norm || 'none'}`
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: `${NATIONAL_ORIGIN}/invite/${norm || ''}`, siteName: 'DentistIn India', type: 'website', images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  if (!(await isNationalRequest())) notFound()
  const { code } = await params
  const norm = normalizeInviteCode(code)
  const d = norm ? await findInviter(norm) : null
  if (!norm || !d) redirect('/join')

  const profile = await loadExpertProfile(d.slug).catch(() => null)
  const city = cityNameOf(d.city)
  const what = profile ? expertHeadline(profile.dentist, profile.topSpecialties) : null
  const detail = [what, city, profile?.caseCount ? `${profile.caseCount} cases shared` : null].filter(Boolean).join(' · ')
  const joinHref = `/join?ref=${encodeURIComponent(norm)}`

  return (
    <NationalShell>
      <RememberInvite code={norm} />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px 64px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...ui.card, display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC' }}>
          <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', background: '#FEF3C7', color: '#78350F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.profile_photo ? <img src={d.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(d.name)}
          </div>
          <div style={{ lineHeight: 1.4 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>Invited by</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{drName(d.name)}</div>
            {detail && <div style={{ fontSize: 13, color: '#475569' }}>{detail}</div>}
          </div>
        </div>
        <h1 style={{ ...ui.h1, fontSize: 26 }}>Join dentists across India sharing real cases</h1>
        <p style={ui.sub}>
          Post a case, get second opinions from other dentists, and build a profile patients find when they search your name. Free forever.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15 }}>
          <li>✓ Case library and second opinions</li>
          <li>✓ Your national expert profile</li>
          <li>✓ Events and courses near you</li>
        </ul>
        <Link href={joinHref} style={{ ...ui.btn, minHeight: 50, fontSize: 16 }}>Join free</Link>
        <Link href="/claim" style={ui.btnGhost}>Already on a DentistIn city site? Claim your profile</Link>
        <Link href={`/professional/${d.slug}`} style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8', textAlign: 'center' }}>See {drName(d.name)}&apos;s profile</Link>
      </main>
    </NationalShell>
  )
}
