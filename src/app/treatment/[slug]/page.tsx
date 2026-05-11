import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 86400

interface Props { params: Promise<{ slug: string; 'treatment-slug': string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, 'treatment-slug': treatmentSlug } = await params
  const supabase = await createClient()
  const [{ data: area }, { data: treatment }] = await Promise.all([
    supabase.from('areas').select('name').eq('slug', slug).single(),
    supabase.from('treatments').select('name').eq('slug', treatmentSlug).single(),
  ])
  if (!area || !treatment) return {}
  return {
    title: `Best ${treatment.name} in ${area.name} Mumbai | dentistinmumbai.in`,
    description: `Find top-rated dentists for ${treatment.name} in ${area.name}, Mumbai. Compare fees, read reviews, book appointments online.`,
    alternates: { canonical: `https://www.dentistinmumbai.in/area/${slug}/${treatmentSlug}` },
  }
}

export default async function AreaTreatmentPage({ params }: Props) {
  const { slug, 'treatment-slug': treatmentSlug } = await params
  const supabase = await createClient()

  const [{ data: area }, { data: treatment }] = await Promise.all([
    supabase.from('areas').select('*').eq('slug', slug).single(),
    supabase.from('treatments').select('*').eq('slug', treatmentSlug).single(),
  ])

  if (!area || !treatment) notFound()

  const { data: dentists } = await supabase
    .from('dentists')
    .select(`id, slug, name, clinic_name, qualifications, experience_years, rating, review_count, consultation_fee, is_verified, tier, dentist_treatments!inner(fee_from, fee_to, treatments(name))`)
    .eq('area_id', area.id)
    .eq('is_active', true)
    .eq('dentist_treatments.treatment_id', treatment.id)
    .order('rating', { ascending: false })
    .limit(20)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: `${treatment.name} in ${area.name} Mumbai`,
    description: `Find verified dentists for ${treatment.name} in ${area.name}, Mumbai`,
    url: `https://www.dentistinmumbai.in/area/${slug}/${treatmentSlug}`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.dentistinmumbai.in' },
        { '@type': 'ListItem', position: 2, name: area.name, item: `https://www.dentistinmumbai.in/area/${slug}` },
        { '@type': 'ListItem', position: 3, name: treatment.name },
      ],
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--blue)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 17 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Link href="/" style={{ color: 'var(--muted)' }}>Home</Link> ›
            <Link href={`/area/${slug}`} style={{ color: 'var(--muted)' }}>{area.name}</Link> ›
            <span style={{ color: 'var(--text)' }}>{treatment.name}</span>
          </div>
        </nav>
      </header>

      <main>
        <section style={{ background: 'linear-gradient(135deg, #003F7A, #0057A8)', padding: '48px 20px 56px' }}>
          <div className="container" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{treatment.icon || '🦷'}</div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.5rem)', color: '#fff', marginBottom: 12, lineHeight: 1.2 }}>
              Best {treatment.name} Dentists<br />in {area.name}, Mumbai
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 24 }}>
              {dentists?.length || 0} verified specialists · Compare fees & book appointments
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href={`/area/${slug}`} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, fontSize: 13, textDecoration: 'none' }}>
                All Dentists in {area.name}
              </Link>
              <Link href={`/treatment/${treatmentSlug}`} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, fontSize: 13, textDecoration: 'none' }}>
                {treatment.name} Across Mumbai
              </Link>
            </div>
          </div>
        </section>

        <section style={{ padding: '48px 20px', background: 'var(--bg)' }}>
          <div className="container">
            {dentists && dentists.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {dentists.map(d => {
                  const dt = (d.dentist_treatments as any)?.[0]
                  return (
                    <div key={d.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👨‍⚕️</div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>{d.name}</span>
                          {d.is_verified && <span style={{ fontSize: 10, fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '1px 6px', borderRadius: 10 }}>✓ Verified</span>}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{d.qualifications}{d.experience_years ? ` · ${d.experience_years} yrs exp` : ''}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{d.clinic_name}</div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 13 }}>
                          {d.rating && <span style={{ color: '#F59E0B', fontWeight: 600 }}>★ {d.rating}</span>}
                          {dt?.fee_from && <span style={{ color: 'var(--green)', fontWeight: 600 }}>From ₹{dt.fee_from}</span>}
                          {d.consultation_fee && <span style={{ color: 'var(--muted)' }}>Consult ₹{d.consultation_fee}</span>}
                        </div>
                      </div>
                      <Link href={`/dentist/${d.slug}`} style={{ padding: '10px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', flexShrink: 0 }}>
                        View Profile →
                      </Link>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🦷</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Be the First {treatment.name} Specialist in {area.name}</h3>
                <p style={{ color: 'var(--muted)', marginBottom: 20 }}>We're onboarding founding member dentists. Free forever.</p>
                <Link href="/for-dentists" style={{ padding: '12px 24px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>List Your Clinic Free →</Link>
              </div>
            )}
          </div>
        </section>

        {/* SEO content */}
        <section style={{ padding: '48px 20px', background: '#fff' }}>
          <div className="container" style={{ maxWidth: 720 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 16 }}>
              {treatment.name} in {area.name} — What to Expect
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
              {area.name} is one of Mumbai's most sought-after areas for dental care, with a growing number of specialist clinics offering {treatment.name.toLowerCase()} treatments. Patients from nearby areas including {area.nearby_areas?.join(', ') || 'across Mumbai'} regularly visit {area.name} dentists for their expertise and modern facilities.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              All dentists listed on dentistinmumbai.in for {treatment.name} in {area.name} are MCI-verified and have been manually reviewed by our team before listing.
            </p>
          </div>
        </section>
      </main>

      <footer style={{ background: '#0A1628', padding: '24px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
      </footer>
    </>
  )
}
