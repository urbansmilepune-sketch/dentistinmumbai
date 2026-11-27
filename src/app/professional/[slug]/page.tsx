import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { getSpecialty } from '@/lib/dentalSpecialties'
import { getDentistPublishedArticles } from '@/lib/publicArticles'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { drName } from '@/lib/dentistName'
import FollowButton from '@/components/national/FollowButton'
import { loadExpertProfile, expertHeadline } from '@/lib/expertProfile'
import ProfileShareButton from '@/components/national/ProfileShareButton'
import InviteBox from '@/components/national/InviteBox'
import { getOrCreateInviteCode, loadInviteStats, type InviteStats } from '@/lib/invites'
import {
  adminDb, getViewerDentist, isFoundingDentist, cityNameOf, cityDomainOf, initialsOf, ui,
} from '@/lib/national'

export const dynamic = 'force-dynamic'

// Public expert profile on dentistinindia.in (v1 dentist network).
//
// This is the page a patient lands on when they search a dentist's name,
// before or after a first consultation. It shows expertise and reputation
// only: how many cases the dentist shared with other dentists, how many
// were checked again later, what they do most, badges, articles. No
// X-rays, no clinical discussion (those stay inside the dentists-only case
// library) and no booking: Book goes to the dentist's city site.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await loadExpertProfile(slug)
  if (!data) return { title: 'Profile not found | DentistIn India', robots: { index: false, follow: false } }
  const d = data.dentist
  const city = cityNameOf(d.city)
  const what = expertHeadline(d, data.topSpecialties)
  const title = `${drName(d.name)}, ${what}${city ? ' in ' + city : ''} | DentistIn India`
  const bits = [
    data.caseCount ? `${data.caseCount} cases shared with dentists across India` : null,
    data.followupCount ? `${data.followupCount} checked after treatment` : null,
    d.is_verified ? 'registration verified' : null,
  ].filter(Boolean).join(', ')
  const description = `${drName(d.name)}${d.clinic_name ? ', ' + d.clinic_name : ''}${city ? ', ' + city : ''}. ${bits ? bits.charAt(0).toUpperCase() + bits.slice(1) + '.' : ''} See their expertise and book at the clinic.`.trim()
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${NATIONAL_ORIGIN}/professional/${d.slug}` },
    openGraph: {
      title, description, type: 'profile', siteName: 'DentistIn India',
      url: `${NATIONAL_ORIGIN}/professional/${d.slug}`,
      images: [{ url: `${NATIONAL_ORIGIN}/api/og/profile/${d.slug}`, width: 1200, height: 630, type: 'image/png', alt: drName(d.name) }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${NATIONAL_ORIGIN}/api/og/profile/${d.slug}`] },
  }
}

export default async function ExpertProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await loadExpertProfile(slug)
  if (!data) notFound()
  const { dentist: d, caseCount, followupCount, answersCount, helpfulCount, likeCount, followerCount, topSpecialties } = data

  const viewer = await getViewerDentist()
  const isOwner = !!viewer && viewer.id === d.id
  let isFollowing = false
  if (viewer && !isOwner) {
    const { data: f } = await adminDb().from('dentist_follows').select('id').eq('follower_id', viewer.id).eq('following_id', d.id).maybeSingle()
    isFollowing = !!f
  }
  const articles = await getDentistPublishedArticles(d.id).catch(() => [])

  // Invite a colleague: owner only. Hidden until the invite SQL has run.
  let invite: { code: string; stats: InviteStats } | null = null
  if (isOwner) {
    const code = await getOrCreateInviteCode(d.id).catch(() => null)
    if (code) invite = { code, stats: await loadInviteStats(d.id, code) }
  }

  const cityName = cityNameOf(d.city)
  const domain = cityDomainOf(d.city)
  const skills: string[] = Array.isArray(d.top_skills) ? d.top_skills.slice(0, 3) : []
  const founding = isFoundingDentist(d.created_at)

  const badges: Array<{ label: string; sub: string; bg: string; color: string }> = []
  if (founding) badges.push({ label: 'Founding Dentist', sub: 'Among the first dentists on DentistIn', bg: '#FEF3C7', color: '#78350F' })
  if (d.is_verified) badges.push({ label: 'Registration verified', sub: 'Dental Council number checked', bg: '#ECFDF5', color: '#065F46' })
  for (const s of topSpecialties) {
    if (s.count >= 5) {
      const label = getSpecialty(s.slug)?.label
      if (label) badges.push({ label: `Active ${label.toLowerCase()} contributor`, sub: `${s.count} cases shared`, bg: '#EFF6FF', color: '#1E3A8A' })
    }
  }
  if (helpfulCount >= 10) badges.push({ label: 'Trusted by peers', sub: `${helpfulCount} answers marked helpful`, bg: '#F5F3FF', color: '#5B21B6' })

  const stats = [
    { n: caseCount, label: 'cases shared with other dentists' },
    { n: followupCount, label: 'cases checked again after treatment' },
    { n: likeCount, label: 'likes from other dentists on their cases' },
    { n: helpfulCount, label: 'times their advice helped another dentist' },
    { n: followerCount, label: 'dentists follow their work' },
    { n: articles.length, label: 'articles written for patients' },
  ]

  return (
    <NationalShell>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section style={{ ...ui.card, padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 30 }}>
            {d.profile_photo ? <img src={d.profile_photo} alt={drName(d.name)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(d.name)}
          </div>
          <h1 style={{ ...ui.h1, margin: 0 }}>{drName(d.name)}</h1>
          <div style={{ fontSize: 15, color: '#475569' }}>
            {expertHeadline(d, topSpecialties)}{cityName ? ` · ${cityName}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {d.qualifications && <span style={ui.pill('#EFF6FF', '#1D4ED8')}>{d.qualifications}</span>}
            {typeof d.experience_years === 'number' && d.experience_years > 0 && <span style={ui.pill('#EFF6FF', '#1D4ED8')}>{d.experience_years}+ years</span>}
            {d.clinic_name && <span style={ui.pill('#F1F5F9', '#334155')}>{d.clinic_name}</span>}
          </div>
          {d.patient_line && (
            <p style={{ fontSize: 15, fontStyle: 'italic', color: '#334155', margin: '4px 0 0', maxWidth: 520 }}>&ldquo;{d.patient_line}&rdquo;</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
            {domain && (
              <a href={`https://${domain}/dentist/${d.slug}`} style={ui.btn}>Book at the clinic{cityName ? ` in ${cityName}` : ''}</a>
            )}
            {isOwner && <Link href="/claim" style={ui.btnGhost}>Edit my profile</Link>}
            <ProfileShareButton slug={d.slug} name={d.name} dentistId={d.id} isOwner={isOwner} />
            {viewer && !isOwner && <FollowButton slug={d.slug} initialFollowing={isFollowing} />}
          </div>
          {domain && <div style={{ fontSize: 12, color: '#475569' }}>Booking opens on {domain}</div>}
        </section>

        <section>
          <h2 style={ui.h2}>Why other dentists trust this doctor</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {stats.map(s => (
              <div key={s.label} style={{ ...ui.card, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, color: '#1D4ED8' }}>{s.n}</div>
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {badges.length > 0 && (
          <section>
            <h2 style={ui.h2}>Earned on DentistIn</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {badges.map(b => (
                <div key={b.label} style={{ borderRadius: 12, padding: '12px 14px', background: b.bg, color: b.color }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{b.label}</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>{b.sub}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(topSpecialties.length > 0 || skills.length > 0) && (
          <section>
            <h2 style={ui.h2}>What this doctor does most</h2>
            <div style={{ ...ui.card, padding: 0 }}>
              {topSpecialties.length > 0
                ? topSpecialties.map((s, i) => (
                  <div key={s.slug} style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderTop: i ? '1px solid #E2E8F0' : 'none', fontSize: 15 }}>
                    <span style={{ fontWeight: 600 }}>{getSpecialty(s.slug)?.label || s.slug}</span>
                    <span style={{ color: '#475569' }}>{s.count} case{s.count === 1 ? '' : 's'}</span>
                  </div>
                ))
                : skills.map((s, i) => (
                  <div key={s} style={{ padding: 14, borderTop: i ? '1px solid #E2E8F0' : 'none', fontSize: 15, fontWeight: 600 }}>{s}</div>
                ))}
            </div>
            <p style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>X-rays and clinical discussion are shared only between dentists.</p>
          </section>
        )}

        {articles.length > 0 && domain && (
          <section>
            <h2 style={ui.h2}>Articles for patients</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {articles.slice(0, 5).map(a => (
                <a key={a.slug} href={`https://${domain}/dentist/${d.slug}/articles/${a.slug}`} style={{ ...ui.card, fontSize: 15, fontWeight: 600, color: '#0F1923', textDecoration: 'none' }}>{a.title}</a>
              ))}
            </div>
          </section>
        )}

        {(d.publications || d.hospital_affiliations) && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {d.publications && <TextBlock title="Courses, talks and publications" value={d.publications} />}
            {d.hospital_affiliations && <TextBlock title="Hospital affiliations" value={d.hospital_affiliations} />}
          </section>
        )}

        {invite && (
          <InviteBox
            dentistId={d.id}
            code={invite.code}
            sent={invite.stats.sent}
            joined={invite.stats.joined}
            recent={invite.stats.recent.map(r => ({ name: drName(r.name), slug: r.slug, when: timeAgo(r.created_at) }))}
          />
        )}

        {viewer && (
          <section style={{ ...ui.card, background: '#0F1923', borderColor: '#0F1923', color: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700 }}>You&apos;re signed in as a dentist</div>
            <div style={{ fontSize: 14, color: '#CBD5E1' }}>{answersCount} replies on other dentists&apos; cases.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/cases?by=${d.slug}`} style={{ ...ui.btn, background: '#fff', color: '#0F1923' }}>{isOwner ? 'My cases' : 'See their cases'}</Link>
              {isOwner && <Link href="/cases/new" style={ui.btn}>Post a case</Link>}
            </div>
          </section>
        )}
      </main>
    </NationalShell>
  )
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div style={ui.card}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, margin: '0 0 8px' }}>{title}</h3>
      <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{value}</p>
    </div>
  )
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'Last week'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
