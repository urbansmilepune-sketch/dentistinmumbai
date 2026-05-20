import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from '@/components/national/NationalShell'
import { CITY_CONFIGS } from '@/config/cities'
import { getSpecialty } from '@/lib/dentalSpecialties'

export const dynamic = 'force-dynamic'

// Professional profile = the public-facing card for a dentist's national
// network presence. Distinct from /dentist/[slug] which is the patient-
// facing booking profile. Service-role read because we surface cases
// (which RLS gates by status='approved') alongside dentist fields, and
// keeping the query in one place is cleaner than splitting between the
// user-bound and admin clients.

interface DentistRow {
  id: string
  name: string
  slug: string
  clinic_name: string | null
  city: string | null
  email: string
  qualifications: string | null
  specialties: string[] | null
  is_active: boolean | null
  is_verified: boolean | null
  experience_years: number | null
  profile_photo: string | null
  professional_bio: string | null
  publications: string | null
  hospital_affiliations: string | null
}

interface CaseRow {
  id: string
  title: string
  specialty: string
  complexity: number
  thumb: string | null
}

async function load(slug: string): Promise<{ dentist: DentistRow; cases: CaseRow[] } | null> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: dentist } = await admin
    .from('dentists')
    .select('id, name, slug, clinic_name, city, email, qualifications, specialties, is_active, is_verified, experience_years, profile_photo, professional_bio, publications, hospital_affiliations')
    .eq('slug', slug)
    .single()
  if (!dentist) return null

  const { data: cases } = await admin
    .from('cases')
    .select('id, title, specialty, complexity')
    .eq('dentist_id', dentist.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(24)

  const caseIds = (cases || []).map((c: any) => c.id as string)
  const thumbs = new Map<string, string>()
  if (caseIds.length) {
    const { data: photos } = await admin
      .from('case_photos')
      .select('case_id, url, kind, display_order')
      .in('case_id', caseIds)
      .order('display_order')
    for (const p of (photos || []) as Array<{ case_id: string; url: string; kind: string }>) {
      if (!thumbs.has(p.case_id) || (p.kind === 'before' || p.kind === 'after')) {
        thumbs.set(p.case_id, p.url)
      }
    }
  }

  return {
    dentist: dentist as unknown as DentistRow,
    cases: (cases || []).map((c: any) => ({
      id: c.id, title: c.title, specialty: c.specialty, complexity: c.complexity,
      thumb: thumbs.get(c.id) ?? null,
    })),
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await load(slug)
  if (!data) return { title: 'Profile not found | Dentist In India' }
  const title = `Dr. ${data.dentist.name} | Dentist In India`
  const description = `Clinical cases and professional profile of Dr. ${data.dentist.name}${data.dentist.clinic_name ? ', ' + data.dentist.clinic_name : ''} on the Dentist In India network.`
  return { title, description }
}

export default async function ProfessionalProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await load(slug)
  if (!data) notFound()
  const { dentist, cases } = data

  // "Edit" affordance only renders if the signed-in user owns this row.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = !!user?.email && user.email.toLowerCase() === dentist.email.toLowerCase()

  const cityCfg = dentist.city ? (CITY_CONFIGS as any)[dentist.city] : null
  const initials = dentist.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <NationalShell badge="Professional">
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px 64px' }}>
        {/* Header card */}
        <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 28, boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {dentist.profile_photo ? <img src={dentist.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.2, color: '#0F1923', marginBottom: 4 }}>
                Dr. {dentist.name}
              </h1>
              {dentist.qualifications && (
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 8 }}>{dentist.qualifications}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {dentist.is_verified && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', background: '#DCFCE7', color: '#166534', borderRadius: 999 }}>✓ MCI-verified</span>
                )}
                {cityCfg && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{cityCfg.cityName}</span>
                )}
                {typeof dentist.experience_years === 'number' && dentist.experience_years > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', background: '#F1F5F9', color: '#475569', borderRadius: 999 }}>{dentist.experience_years}+ years</span>
                )}
              </div>
              {dentist.clinic_name && (
                <div style={{ fontSize: 14, color: '#475569' }}>{dentist.clinic_name}</div>
              )}
              {(dentist.specialties && dentist.specialties.length > 0) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  {dentist.specialties.map(sp => (
                    <span key={sp} style={{ fontSize: 11, padding: '3px 9px', background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 999, fontWeight: 600 }}>{sp}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cityCfg && (
                <a href={`https://${cityCfg.domain}/dentist/${dentist.slug}`} target="_blank" rel="noopener" style={{ padding: '9px 16px', minHeight: 38, background: '#1D4ED8', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                  Book on {cityCfg.cityName} →
                </a>
              )}
              {isOwner && (
                <Link href="/professional/me/edit" style={{ padding: '9px 16px', minHeight: 38, background: '#fff', color: '#0F1923', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                  Edit profile
                </Link>
              )}
            </div>
          </div>

          {dentist.professional_bio && (
            <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, marginTop: 20, whiteSpace: 'pre-wrap' }}>
              {dentist.professional_bio}
            </p>
          )}
        </section>

        {/* Cases gallery */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923' }}>
              Cases · <span style={{ color: '#64748B', fontWeight: 600 }}>{cases.length}</span>
            </h2>
            {isOwner && (
              <Link href="/cases/new" style={{ fontSize: 13, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>+ Post a case</Link>
            )}
          </div>
          {cases.length === 0 ? (
            <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 36, textAlign: 'center', color: '#64748B', fontSize: 14 }}>
              {isOwner ? (
                <>No cases yet. <Link href="/cases/new" style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>Post your first →</Link></>
              ) : (
                <>No public cases yet.</>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {cases.map(c => {
                const spec = getSpecialty(c.specialty)
                return (
                  <Link key={c.id} href={`/cases/${c.id}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: '#0F1923' }}>
                    <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#F1F5F9', overflow: 'hidden' }}>
                      {c.thumb ? <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 28 }}>🦷</div>}
                    </div>
                    <div style={{ padding: 14 }}>
                      {spec && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', background: spec.bg, color: spec.color, borderRadius: 999 }}>{spec.label}</span>}
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: '#0F1923', marginTop: 6, lineHeight: 1.35 }}>{c.title}</h3>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Publications + affiliations */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <ProfileBlock
            title="Publications"
            value={dentist.publications}
            emptyHint={isOwner ? 'Add papers, talks, posters or features you want listed publicly.' : 'No publications listed.'}
          />
          <ProfileBlock
            title="Hospital affiliations"
            value={dentist.hospital_affiliations}
            emptyHint={isOwner ? 'List hospitals or specialist centres you visit or consult at.' : 'No affiliations listed.'}
          />
        </div>

        {/* Coming soon panels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 18 }}>
          <ComingSoon label="CPD points earned"  value="0" hint="Continuing dental education tracking is coming soon." />
          <ComingSoon label="Courses"             value="0" hint="Course creation + enrolment is coming soon." />
          <ComingSoon label="Followers"           value="0" hint="Following + feed is coming in Phase 1b." />
        </div>
      </main>
    </NationalShell>
  )
}

function ProfileBlock({ title, value, emptyHint }: { title: string; value: string | null; emptyHint: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, color: '#0F1923', marginBottom: 10 }}>{title}</h3>
      {value
        ? <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</p>
        : <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6, fontStyle: 'italic' }}>{emptyHint}</p>}
    </div>
  )
}

function ComingSoon({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#94A3B8', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>{hint}</div>
    </div>
  )
}
