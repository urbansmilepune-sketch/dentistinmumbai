import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 86400

const TREATMENT_META: Record<string, { icon: string; description: string; avgCost: string; duration: string; schema: string }> = {
  'dental-implants':   { icon: '🦷', description: 'Permanent tooth replacement solution using titanium posts fused to the jawbone.', avgCost: '₹25,000–₹80,000', duration: '3–6 months', schema: 'DentalImplant' },
  'teeth-whitening':   { icon: '✨', description: 'Professional teeth whitening to remove stains and brighten your smile.', avgCost: '₹3,000–₹15,000', duration: '1–2 hours', schema: 'ToothWhitening' },
  'braces-aligners':   { icon: '😁', description: 'Orthodontic treatment to straighten teeth and correct bite issues.', avgCost: '₹25,000–₹1,20,000', duration: '12–24 months', schema: 'OrthodonticTreatment' },
  'root-canal':        { icon: '🔬', description: 'Treatment to remove infected pulp and save a damaged tooth.', avgCost: '₹3,000–₹12,000', duration: '1–2 sessions', schema: 'RootCanalProcedure' },
  'tooth-extraction':  { icon: '🦷', description: 'Safe removal of damaged, decayed or impacted teeth.', avgCost: '₹500–₹5,000', duration: '30–60 minutes', schema: 'ToothExtraction' },
  'dental-crowns':     { icon: '👑', description: 'Custom caps to restore shape, strength and appearance of damaged teeth.', avgCost: '₹5,000–₹25,000', duration: '2 visits', schema: 'DentalCrown' },
  'veneers':           { icon: '💎', description: 'Thin porcelain shells bonded to teeth for a perfect smile.', avgCost: '₹8,000–₹30,000', duration: '2–3 visits', schema: 'DentalVeneer' },
  'teeth-cleaning':    { icon: '🪥', description: 'Professional scaling and polishing to remove plaque and tartar.', avgCost: '₹500–₹2,500', duration: '45–60 minutes', schema: 'DentalCleaning' },
  'smile-makeover':    { icon: '😊', description: 'Comprehensive cosmetic treatment combining whitening, veneers, and alignment.', avgCost: '₹50,000–₹3,00,000', duration: '2–6 months', schema: 'SmileMakeover' },
  'dentures':          { icon: '🦷', description: 'Removable replacements for missing teeth and surrounding tissue.', avgCost: '₹8,000–₹50,000', duration: '3–5 visits', schema: 'Denture' },
  'gum-treatment':     { icon: '❤️', description: 'Treatment for gum disease including scaling, root planing and surgery.', avgCost: '₹2,000–₹20,000', duration: '1–4 sessions', schema: 'PeriodontalTreatment' },
  'kids-dentistry':    { icon: '👶', description: 'Specialized dental care for children including checkups, fillings and fluoride.', avgCost: '₹300–₹5,000', duration: '30–60 minutes', schema: 'PediatricDentistry' },
  'emergency-dental':  { icon: '🚨', description: 'Same-day treatment for dental pain, broken teeth, lost fillings or swelling.', avgCost: '₹500–₹8,000', duration: 'Same day', schema: 'EmergencyDentalCare' },
  'dental-xray':       { icon: '📷', description: 'Digital X-rays and OPG scans for diagnosis and treatment planning.', avgCost: '₹200–₹2,000', duration: '15–30 minutes', schema: 'DentalRadiology' },
  'wisdom-tooth':      { icon: '🦷', description: 'Surgical removal of impacted or problematic wisdom teeth.', avgCost: '₹3,000–₹15,000', duration: '30–90 minutes', schema: 'WisdomToothRemoval' },
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return Object.keys(TREATMENT_META).map(slug => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: treatment } = await supabase.from('treatments').select('name').eq('slug', slug).single()
  if (!treatment) return {}
  return {
    title: `Best ${treatment.name} Dentists in Mumbai | dentistinmumbai.in`,
    description: `Find top-rated dentists for ${treatment.name} in Mumbai. Compare fees, read patient reviews, and book appointments. ${TREATMENT_META[slug]?.avgCost || ''} avg cost.`,
    alternates: { canonical: `https://www.dentistinmumbai.in/treatment/${slug}` },
  }
}

export default async function TreatmentPage({ params }: Props) {
  const { slug } = await params
  const meta = TREATMENT_META[slug]
  if (!meta) notFound()

  const supabase = await createClient()

  const [{ data: treatment }, { data: dentists }, { data: areas }] = await Promise.all([
    supabase.from('treatments').select('*').eq('slug', slug).single(),
    supabase.from('dentists')
      .select('id, slug, name, clinic_name, qualifications, experience_years, rating, review_count, consultation_fee, tier, is_verified, areas(name, slug)')
      .eq('is_active', true)
      .order('tier', { ascending: false })
      .order('rating', { ascending: false })
      .limit(12),
    supabase.from('areas').select('name, slug').order('name').limit(24),
  ])

  if (!treatment) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalProcedure',
    name: treatment.name,
    description: meta.description,
    procedureType: 'https://schema.org/TherapeuticProcedure',
    followup: `Find ${treatment.name} specialists in Mumbai on dentistinmumbai.in`,
    url: `https://www.dentistinmumbai.in/treatment/${slug}`,
  }

  const FAQS = [
    { q: `How much does ${treatment.name} cost in Mumbai?`, a: `${treatment.name} in Mumbai typically costs ${meta.avgCost} depending on the clinic, area, and complexity of the case. Use our search to compare fees across dentists.` },
    { q: `How long does ${treatment.name} take?`, a: `${treatment.name} typically takes ${meta.duration}. Your dentist will give you a precise timeline after an initial consultation.` },
    { q: `Is ${treatment.name} painful?`, a: `Modern dental techniques and anaesthesia make most procedures comfortable. Your dentist will ensure you are pain-free during treatment.` },
    { q: `How do I find the best ${treatment.name} specialist in Mumbai?`, a: `Search by your area on dentistinmumbai.in to compare verified specialists by rating, experience, and fees. All dentists are MCI-verified.` },
    { q: `Do I need a consultation before ${treatment.name}?`, a: `Yes. An initial consultation is recommended so the dentist can assess your specific needs, take X-rays if needed, and provide an accurate cost estimate.` },
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* NAV */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--blue)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontFamily: 'var(--font-heading)', fontSize: 18 }}>D</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>DentistInMumbai<span style={{ color: 'var(--blue)' }}>.in</span></span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>Find Dentists</Link>
            <Link href="/for-dentists" className="btn btn-primary btn-sm">List Your Clinic</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* HERO */}
        <section style={{ background: 'linear-gradient(135deg, #003F7A, #0057A8)', padding: '56px 20px 64px' }}>
          <div className="container">
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              <Link href="/" style={{ color: 'rgba(255,255,255,0.6)' }}>Home</Link>
              <span>›</span>
              <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.6)' }}>Treatments</Link>
              <span>›</span>
              <span style={{ color: '#fff' }}>{treatment.name}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>{meta.icon}</div>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.75rem)', color: '#fff', marginBottom: 12, lineHeight: 1.15 }}>
                  Best {treatment.name} Dentists in Mumbai
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 17, lineHeight: 1.7, maxWidth: 560, marginBottom: 28 }}>
                  {meta.description} Find verified specialists across all Mumbai areas.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link href="/dentists" className="btn btn-primary">Find Specialists →</Link>
                  <Link href="/for-dentists" style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>List Your Clinic</Link>
                </div>
              </div>

              {/* Quick facts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
                {[
                  { label: 'Avg. Cost', value: meta.avgCost },
                  { label: 'Duration', value: meta.duration },
                  { label: 'Available Areas', value: '24+ in Mumbai' },
                  { label: 'Verified Specialists', value: `${dentists?.length || 0}+ listed` },
                ].map(item => (
                  <div key={item.label} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 18px', backdropFilter: 'blur(8px)' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#fff' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* DENTIST LIST */}
        <section style={{ padding: '64px 20px', background: 'var(--bg)' }}>
          <div className="container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: 4 }}>
                  Top {treatment.name} Specialists in Mumbai
                </h2>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>{dentists?.length || 0} verified dentists found</p>
              </div>
              <Link href={`/dentists?treatment=${slug}`} style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>View all →</Link>
            </div>

            {dentists && dentists.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {dentists.map(d => (
                  <div key={d.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', transition: 'box-shadow 0.2s' }}>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👨‍⚕️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                          {d.is_verified && <span style={{ fontSize: 10, fontWeight: 600, color: '#166534', background: '#DCFCE7', padding: '1px 6px', borderRadius: 10 }}>✓ Verified</span>}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{d.qualifications}</div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{d.clinic_name}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: 13 }}>
                      {d.rating && <span style={{ color: '#F59E0B', fontWeight: 600 }}>★ {d.rating}</span>}
                      {d.experience_years && <span style={{ color: 'var(--muted)' }}>{d.experience_years} yrs exp</span>}
                      {(d.areas as any)?.name && <span style={{ color: 'var(--muted)' }}>📍 {(d.areas as any).name}</span>}
                    </div>
                    {d.consultation_fee && (
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 14 }}>
                        Consultation: ₹{d.consultation_fee}
                      </div>
                    )}
                    <Link href={`/dentist/${d.slug}`} style={{ display: 'block', textAlign: 'center', padding: '9px', background: 'var(--blue)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13 }}>
                      View Profile & Book →
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>{meta.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Be the First {treatment.name} Specialist Listed</h3>
                <p style={{ color: 'var(--muted)', marginBottom: 20 }}>We're onboarding founding member dentists right now. Free forever.</p>
                <Link href="/for-dentists" className="btn btn-primary">List Your Clinic Free →</Link>
              </div>
            )}
          </div>
        </section>

        {/* COST GUIDE */}
        <section style={{ padding: '64px 20px', background: '#fff' }}>
          <div className="container" style={{ maxWidth: 800 }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: 8 }}>
                {treatment.name} Cost Guide — Mumbai
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 15 }}>Average fee ranges across Mumbai areas</p>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--blue)', color: '#fff' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Area</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Min. Fee</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Max. Fee</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {['Bandra', 'Andheri', 'Juhu', 'Borivali', 'Thane', 'Dadar', 'Powai', 'Navi Mumbai'].map((area, i) => {
                    const areaSlug = area.toLowerCase().replace(' ', '-')
                    return (
                      <tr key={area} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : 'var(--bg)' }}>
                        <td style={{ padding: '12px 20px', fontWeight: 600, fontSize: 14 }}>{area}</td>
                        <td style={{ padding: '12px 20px', fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>{meta.avgCost.split('–')[0]}</td>
                        <td style={{ padding: '12px 20px', fontSize: 14, color: 'var(--orange)', fontWeight: 600 }}>{meta.avgCost.split('–')[1]}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <Link href={`/area/${areaSlug}`} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>Find dentists →</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, textAlign: 'center' }}>* Fees are indicative. Actual costs depend on complexity and dentist. Get a consultation for accurate pricing.</p>
          </div>
        </section>

        {/* AREAS */}
        <section style={{ padding: '64px 20px', background: 'var(--bg)' }}>
          <div className="container">
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: 8, textAlign: 'center' }}>
              {treatment.name} by Area in Mumbai
            </h2>
            <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: 28 }}>Find specialists near you</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {(areas || []).map(area => (
                <Link key={area.slug} href={`/area/${area.slug}/${slug}`} style={{ padding: '8px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 20, fontSize: 13, fontWeight: 500, color: 'var(--text)', transition: 'all 0.15s' }}>
                  {treatment.name} in {area.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ padding: '64px 20px', background: '#fff' }}>
          <div className="container" style={{ maxWidth: 720 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.4rem, 3vw, 2rem)', marginBottom: 32, textAlign: 'center' }}>
              Frequently Asked Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FAQS.map((faq, i) => (
                <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text)' }}>{faq.q}</h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section style={{ padding: '64px 20px', background: 'linear-gradient(135deg, #003F7A, #0057A8)', textAlign: 'center' }}>
          <div className="container" style={{ maxWidth: 560 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 4vw, 2.25rem)', color: '#fff', marginBottom: 12 }}>
              Ready to Book Your {treatment.name}?
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 28 }}>
              Compare verified {treatment.name} specialists across Mumbai. Free for patients.
            </p>
            <Link href={`/dentists?treatment=${slug}`} className="btn btn-primary" style={{ fontSize: 16, padding: '14px 32px' }}>
              Find {treatment.name} Specialists →
            </Link>
          </div>
        </section>
      </main>

      <footer style={{ background: '#0A1628', padding: '32px 20px', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} dentistinmumbai.in · A Dentaura Prime LLP initiative · All rights reserved</p>
      </footer>
    </>
  )
}
