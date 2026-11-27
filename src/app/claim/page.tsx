import type { Metadata } from 'next'
import { nationalPreview } from '@/lib/sharePreview'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { createClient } from '@/lib/supabase/server'
import { adminDb, isNationalRequest, isFoundingDentist, cityNameOf, initialsOf, SKILL_OPTIONS, ui } from '@/lib/national'
import ClaimForm from './ClaimForm'
import { drName } from '@/lib/dentistName'
import { liveCaseCount } from '@/lib/firstCase'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Claim your free national profile | DentistIn India',
  description: 'Every dentist on a DentistIn city site already has a national profile. Claim it in a minute, free forever.',
  robots: { index: false, follow: true },
  ...nationalPreview({
    title: 'Claim your free national profile on DentistIn India',
    description: 'Every dentist on a DentistIn city site already has a national profile. Claim it in a minute, free forever.',
    path: '/claim',
  }),
}

// /claim — the 288 existing dentists (and anyone new) claim the national
// profile that is already built from their city-site profile: check what
// was filled in, pick up to 3 skills, write one line for patients.

export default async function ClaimPage() {
  if (!(await isNationalRequest())) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return (
      <NationalShell>
        <main style={{ maxWidth: 620, margin: '0 auto', padding: '36px 16px 64px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={{ ...ui.pill('#FEF3C7', '#78350F'), alignSelf: 'flex-start' }}>Free forever</span>
          <h1 style={ui.h1}>Your national profile is ready</h1>
          <p style={ui.sub}>
            If you&apos;re on any DentistIn city site, we&apos;ve already built your dentistinindia.in profile from it. Sign in with the same email to check it and make it yours.
          </p>
          <div style={{ ...ui.card, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700 }}>What you get</div>
            <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              A profile patients find when they search your name · your cases and follow-ups as proof of your work · advice from dentists across India · events and courses near you · the Founding Dentist badge if you joined before 1 December 2026
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/for-dentists/login?next=/claim" style={ui.btn}>Sign in to claim</Link>
            <Link href="/for-dentists/register" style={ui.btnGhost}>New here? Join free</Link>
          </div>
        </main>
      </NationalShell>
    )
  }

  const { data: d } = await adminDb().from('dentists').select('*').eq('email', user.email).order('created_at').limit(1).maybeSingle()
  if (!d) {
    return (
      <NationalShell>
        <main style={{ maxWidth: 620, margin: '0 auto', padding: '36px 16px 64px' }}>
          <h1 style={ui.h1}>We couldn&apos;t find your dentist profile</h1>
          <p style={{ ...ui.sub, marginBottom: 16 }}>You&apos;re signed in as {user.email}, but no dentist is registered with that email.</p>
          <Link href="/for-dentists/register" style={ui.btn}>Register free</Link>
        </main>
      </NationalShell>
    )
  }

  const caseCount = await liveCaseCount(d.id)
  const treatments: string[] = Array.isArray(d.specialties) ? d.specialties : []
  const filled = [
    { label: 'Photo, clinic and address', ok: !!(d.profile_photo || d.clinic_name) },
    { label: 'Treatments you offer', ok: treatments.length > 0 },
    { label: 'Registration number', ok: !!d.is_verified, okText: 'Checked', noText: 'Not checked yet' },
  ]

  return (
    <NationalShell>
      <main style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px 64px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={ui.h1}>{d.network_claimed_at ? 'Your national profile' : 'Check what we filled in'}</h1>
        <section style={{ ...ui.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, flexShrink: 0 }}>
              {d.profile_photo ? <img src={d.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(d.name)}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{drName(d.name)}</div>
              <div style={{ fontSize: 13, color: '#475569' }}>{[d.qualifications, d.clinic_name, cityNameOf(d.city)].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 10 }}>
            {filled.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: 12, borderTop: i ? '1px solid #E2E8F0' : 'none', fontSize: 14 }}>
                <span>{f.label}</span>
                <span style={{ fontWeight: 700, color: f.ok ? '#047857' : '#B45309' }}>{f.ok ? (f.okText || 'From your city site') : (f.noText || 'Missing')}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#475569' }}>Name, photo, clinic and fees are edited on your city dashboard and update here automatically.</div>
        </section>
        <ClaimForm
          slug={d.slug}
          options={SKILL_OPTIONS}
          initialSkills={Array.isArray(d.top_skills) ? d.top_skills : []}
          initialLine={d.patient_line || ''}
          alreadyClaimed={!!d.network_claimed_at}
          founding={isFoundingDentist(d.created_at)}
          caseCount={caseCount}
        />
      </main>
    </NationalShell>
  )
}
