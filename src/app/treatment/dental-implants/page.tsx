import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import { getAreaTreatmentCompleteCounts } from '@/lib/cache/public-pages'
import SiteHeader from '@/components/SiteHeader'
import DentistResultCard, { type ResultDentist } from '@/components/DentistResultCard'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// Bespoke landing page for Dental Implants, the biggest search we rank far
// for ("dental implants in pune" and variants: ~2,100 impressions at position
// 53–73 in GSC, Nov 2026). A STATIC route segment that overrides the generic
// /treatment/[slug] template for this one slug, the same way
// /treatment/root-canal does. Answer-first: the price is in the title and the
// first paragraph. No single dentist is featured as a reviewer: every listed
// dentist is treated the same (Ashish, 6 Nov 2026).
//
// Price ranges are from published Pune clinic prices (Clove Dental, Dezy;
// Nov 2026). The live fee table comes from fees our dentists publish.
// headers() forces dynamic rendering.
export const dynamic = 'force-dynamic'

const SLUG = 'dental-implants'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const C = city.cityName
  return {
    // Price first, under ~60 characters, like the root canal page.
    title: `Dental Implant Cost in ${C}: ₹25,000–₹60,000 per Tooth (2026)`,
    description: `Dental implants in ${C} cost ₹25,000–₹60,000 per tooth with crown. Korean/Indian systems from ₹25,000, Straumann or Nobel ₹45,000+. Compare real fees from verified dentists and book.`,
    alternates: { canonical: `${cityOrigin(city)}/treatment/${SLUG}` },
    robots: { index: true, follow: true },
  }
}

type FeeRow = {
  id: string
  areas: { id: number; name: string; slug: string } | null
  dentist_treatments: { fee_from: number | null; fee_to: number | null }[]
}

type AreaAgg = { id: number; name: string; slug: string; offering: number; feeCount: number; minFrom: number; maxTo: number }

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default async function DentalImplantsPage() {
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const C = city.cityName
  const origin = cityOrigin(city)
  const citySlug = city.citySlug

  const { data: treatment } = await supabase.from('treatments').select('id, name').eq('slug', SLUG).single()
  if (!treatment) notFound()

  // Fee rows for the live table, the top dentists for the cards, and which
  // area + implants pages are live (≥3 complete dentists), so we only link
  // to pages that render instead of redirecting.
  const [{ data: rowsRaw }, { data: topRaw }, atCounts] = await Promise.all([
    supabase
      .from('dentists')
      .select('id, areas(id, name, slug), dentist_treatments!inner(fee_from, fee_to, treatment_id)')
      .eq('is_active', true)
      .eq('city', citySlug)
      .eq('dentist_treatments.treatment_id', treatment.id)
      .limit(1000),
    supabase
      .from('dentists')
      .select(`
        id, slug, name, clinic_name, qualifications, experience_years,
        gender, consultation_fee, emi_available, is_verified, tier,
        profile_photo, whatsapp, phone, working_hours, lat, lng,
        avg_rating, review_count,
        areas(name, slug),
        dentist_treatments!inner(fee_from, fee_to, treatment_id)
      `)
      .eq('is_active', true)
      .eq('city', citySlug)
      .eq('dentist_treatments.treatment_id', treatment.id)
      .order('rank_score', { ascending: false })
      .limit(6),
    getAreaTreatmentCompleteCounts(citySlug),
  ])
  const rows = (rowsRaw || []) as unknown as FeeRow[]
  const isLive = (areaId: number) => (atCounts[`${areaId}:${treatment.id}`] ?? 0) >= 3

  const areaMap = new Map<string, AreaAgg>()
  for (const r of rows) {
    const a = r.areas
    if (!a?.slug) continue
    const cur = areaMap.get(a.slug) ?? { id: a.id, name: a.name, slug: a.slug, offering: 0, feeCount: 0, minFrom: Infinity, maxTo: 0 }
    cur.offering++
    const f = r.dentist_treatments?.[0]?.fee_from
    const t = r.dentist_treatments?.[0]?.fee_to
    if (typeof f === 'number' && f > 0) {
      cur.feeCount++
      cur.minFrom = Math.min(cur.minFrom, f)
      cur.maxTo = Math.max(cur.maxTo, typeof t === 'number' && t > 0 ? t : f)
    }
    areaMap.set(a.slug, cur)
  }
  const allAreas = [...areaMap.values()]
  const feeAreas = allAreas
    .filter(a => a.feeCount > 0)
    .sort((x, y) => y.feeCount - x.feeCount || x.minFrom - y.minFrom)
    .slice(0, 12)
  const liveAreas = allAreas
    .filter(a => isLive(a.id))
    .sort((x, y) => y.offering - x.offering)
    .slice(0, 8)
  const totalOffering = rows.length
  const feeCountAll = allAreas.reduce((s, a) => s + a.feeCount, 0)
  const lowestFee = feeAreas.length ? Math.min(...feeAreas.map(a => a.minFrom)) : null

  const feeRange = (a: AreaAgg) => (a.maxTo > a.minFrom ? `${inr(a.minFrom)} – ${inr(a.maxTo)}` : `From ${inr(a.minFrom)}`)

  // The card only reads the shared dentist fields; the fee embed is read
  // here for the per-card note.
  const topDentists = ((topRaw || []) as unknown as (Omit<ResultDentist, 'dentist_treatments'> & { dentist_treatments?: { fee_from: number | null }[] })[]).map(d => {
    const f = d.dentist_treatments?.[0]?.fee_from
    return { ...d, dentist_treatments: undefined, _feeFrom: typeof f === 'number' && f > 0 ? f : null }
  })
  const noteFor = (d: { _feeFrom: number | null }) =>
    d._feeFrom !== null ? `Implants from ${inr(d._feeFrom)}` : 'Offers dental implants'

  const faqs = [
    { q: `How much does a dental implant cost in ${C}?`, a: `A single dental implant with crown costs ₹25,000 to ₹60,000 in ${C} (2026). Korean and Indian implant systems start around ₹25,000; Straumann and Nobel Biocare usually cost ₹45,000 or more. A 3D scan (₹2,000–₹4,000) and bone grafting (₹8,000–₹25,000) are extra if needed.` },
    { q: `How much do full mouth dental implants cost in ${C}?`, a: `A fixed full arch on 4 to 6 implants (All-on-4 or All-on-6) costs about ₹1,25,000 to ₹3,00,000 per jaw in ${C}. Both jaws cost roughly double. The price depends on the implant brand and whether the teeth are acrylic, PFM or zirconia.` },
    { q: `Is getting a dental implant painful?`, a: `The implant is placed under local anaesthesia, so most patients feel pressure rather than pain. Some swelling and soreness for 2–3 days is normal and is managed with common painkillers.` },
    { q: `How long does dental implant treatment take?`, a: `Usually 3 to 6 months from start to finish: a check-up and 3D scan, placing the implant, 2 to 4 months for it to bond with the bone, then fitting the crown. In some cases a same-day (immediate load) implant is possible.` },
    { q: `How long do dental implants last?`, a: `With good cleaning and regular check-ups, implants commonly last 15 years or more, and many last a lifetime. The crown on top may need replacing after 10 to 15 years.` },
    { q: `Who should not get dental implants?`, a: `Uncontrolled diabetes, heavy smoking, active gum disease or very thin jaw bone can affect healing. Your dentist checks these with a 3D scan before recommending an implant; bone grafting can often solve thin bone.` },
    { q: `Can I pay for dental implants in EMI in ${C}?`, a: `Many ${C} clinics offer EMI on implants. Look for dentists marked EMI on DentistIn or ask the clinic before treatment starts.` },
    { q: `Does health insurance cover dental implants?`, a: `Usually not. Most Indian health policies exclude dental treatment unless it follows an accident. Check your policy wording before planning treatment.` },
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: `Dental Implant Cost in ${C}`,
    description: `Dental implants in ${C} cost ₹25,000 to ₹60,000 per tooth with crown. Compare verified fees from dentists across ${C}.`,
    url: `${origin}/treatment/${SLUG}`,
    medicalAudience: { '@type': 'MedicalAudience', audienceType: 'Patient' },
    lastReviewed: '2026-11-06',
    about: { '@type': 'MedicalProcedure', name: 'Dental Implant', procedureType: 'Surgical' },
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
      { '@type': 'ListItem', position: 2, name: 'Dental Implants', item: `${origin}/treatment/${SLUG}` },
    ],
  }

  // Shared inline style tokens (same as the root canal page).
  const h2 = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: NAVY, margin: '0 0 16px' } as const
  const h3 = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: NAVY, margin: '0 0 10px' } as const
  const p = { fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 } as const
  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(18px, 4vw, 32px)', marginBottom: 24 } as const
  const th = { textAlign: 'left' as const, padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: NAVY, background: '#F8FAFC', borderBottom: '1px solid var(--border)' }
  const td = { padding: '10px 12px', fontSize: 14, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' as const }
  const stat = { display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12 } as const

  const typeCosts: [string, string, string][] = [
    ['Standard', 'Korean / Indian systems (e.g. Osstem)', '₹25,000 – ₹35,000'],
    ['Premium', 'Straumann, Nobel Biocare', '₹45,000 – ₹60,000'],
    ['Full arch (All-on-4 / All-on-6)', 'Per jaw, fixed teeth', '₹1,25,000 – ₹3,00,000'],
  ]
  const extras: [string, string][] = [
    ['3D CBCT scan', '₹2,000 – ₹4,000'],
    ['Bone graft (if bone is thin)', '₹8,000 – ₹25,000'],
    ['Zirconia crown instead of PFM', 'adds ₹5,000 – ₹10,000'],
  ]
  const steps: [string, string][] = [
    ['Check-up and 3D scan', 'The dentist checks your bone and gums. 1 visit.'],
    ['Implant placed', 'Under local anaesthesia, 30–60 minutes per implant.'],
    ['Healing', 'The implant bonds with the bone over 2–4 months.'],
    ['Crown fitted', 'The final tooth is fixed on top. 1–2 visits.'],
  ]
  const compare: [string, string, string, string][] = [
    ['Cost per tooth', '₹25,000 – ₹60,000', '₹15,000 – ₹40,000', '₹10,000 – ₹40,000 (full set)'],
    ['Lasts', '15+ years', '10–15 years', '5–8 years'],
    ['Fixed in place', 'Yes', 'Yes', 'No, removable'],
    ['Cuts neighbouring teeth', 'No', 'Yes', 'No'],
    ['Protects jaw bone', 'Yes', 'No', 'No'],
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      <SiteHeader city={city} />

      {/* HERO — answer first */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <nav aria-label="Breadcrumb" style={{ display: 'flex', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{C}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Treatments</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Dental Implants</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.5rem, 4.5vw, 2.2rem)', color: '#fff', marginBottom: 14, lineHeight: 1.25 }}>
            Dental Implant Cost in {C}: ₹25,000–₹60,000 per Tooth (2026)
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.88)', lineHeight: 1.7, marginBottom: 18, maxWidth: 720 }}>
            A single dental implant with crown costs <strong style={{ color: '#fff' }}>₹25,000 to ₹60,000</strong> in {C}.
            Korean and Indian implant systems start around ₹25,000; Straumann and Nobel cost ₹45,000 or more. A fixed
            full arch on 4 implants costs ₹1,25,000 to ₹3,00,000 per jaw.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {totalOffering > 0 && (
              <div style={stat}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: TEAL }}>{totalOffering}</span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{totalOffering === 1 ? 'dentist offers' : 'dentists offer'} implants</span>
              </div>
            )}
            {lowestFee !== null && (
              <div style={stat}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: TEAL }}>{inr(lowestFee)}</span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>lowest listed fee</span>
              </div>
            )}
          </div>

          <a href="#dentists" style={{ display: 'inline-block', padding: '13px 22px', background: TEAL, color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 15 }}>
            Compare implant dentists ↓
          </a>
        </div>
      </section>

      <main style={{ background: 'var(--bg)', padding: '32px 16px 48px' }}>
        <div className="container" style={{ maxWidth: 860 }}>

          {/* COST BY TYPE */}
          <div style={card}>
            <h2 style={h2}>Dental implant cost in {C} by type</h2>
            <p style={p}>Per tooth, including the implant, abutment and crown. Ranges as of November 2026.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead><tr><th style={th}>Type</th><th style={th}>Typical cost in {C}</th></tr></thead>
                <tbody>
                  {typeCosts.map(([k, sub, v]) => (
                    <tr key={k}>
                      <td style={td}><strong style={{ color: NAVY }}>{k}</strong><br /><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span></td>
                      <td style={{ ...td, fontWeight: 700, color: TEAL, whiteSpace: 'nowrap' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 style={h3}>Extra costs to ask about</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <tbody>
                  {extras.map(([k, v]) => (
                    <tr key={k}><td style={td}>{k}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ ...p, marginBottom: 0, fontSize: 14, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
              <strong>Ask for one total price:</strong> implant, abutment, crown, scan and any bone graft. A low implant
              quote can double once the crown and extras are added.
            </p>
          </div>

          {/* LIVE FEE DATA */}
          <div style={card}>
            <h2 style={h2}>What {C} dentists on DentistIn charge for implants</h2>
            <p style={p}>
              Starting fees that dentists registered on DentistIn publish on their profiles. This table updates by itself
              as dentists add or change their fees.
            </p>
            {feeAreas.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Area</th><th style={th}>Implant fees</th><th style={th}>Dentists</th></tr></thead>
                    <tbody>
                      {feeAreas.map(a => (
                        <tr key={a.slug}>
                          <td style={td}>
                            {isLive(a.id)
                              ? <Link href={`/area/${a.slug}/${SLUG}`} style={{ color: TEAL, fontWeight: 600 }}>{a.name}</Link>
                              : <Link href={`/area/${a.slug}`} style={{ color: TEAL, fontWeight: 600 }}>{a.name}</Link>}
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>{feeRange(a)}</td>
                          <td style={td}>{a.feeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0' }}>
                  {feeCountAll} of {totalOffering} dentists offering implants in {C} publish a fee.
                </p>
              </>
            ) : (
              <div style={{ background: '#F8FAFC', border: '1px dashed var(--border)', borderRadius: 12, padding: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
                {totalOffering > 0
                  ? <>We list <strong>{totalOffering}</strong> {totalOffering === 1 ? 'dentist' : 'dentists'} offering implants in {C}. Published fees appear here as dentists add them.</>
                  : <>We&apos;re adding implant dentists in {C}. Published fees appear here as they join.</>}
              </div>
            )}
          </div>

          {/* HOW IT WORKS */}
          <div style={card}>
            <h2 style={h2}>How dental implant treatment works</h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {steps.map(([title, body], i) => (
                <li key={title} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: '#F0FDFA', color: TEAL, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)' }}>{i + 1}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{title}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{body}</div>
                  </div>
                </li>
              ))}
            </ol>
            <p style={{ ...p, marginBottom: 0 }}>
              Total time is usually <strong>3 to 6 months</strong>. Same-day (immediate load) implants are possible when the
              bone is strong enough; your dentist decides after the scan.
            </p>
          </div>

          {/* COMPARISON */}
          <div style={card}>
            <h2 style={h2}>Implant vs bridge vs denture</h2>
            <p style={p}>All three replace a missing tooth. An implant costs the most up front but lasts longest and does not touch the teeth next to it.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead><tr><th style={th}></th><th style={th}>Implant</th><th style={th}>Bridge</th><th style={th}>Denture</th></tr></thead>
                <tbody>
                  {compare.map(([k, a, b, c]) => (
                    <tr key={k}>
                      <td style={{ ...td, fontWeight: 700, color: NAVY }}>{k}</td>
                      <td style={td}>{a}</td><td style={td}>{b}</td><td style={td}>{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DENTISTS */}
          <div id="dentists" style={{ marginBottom: 24, scrollMarginTop: 80 }}>
            <h2 style={h2}>Dentists for dental implants in {C}</h2>
            {topDentists.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {topDentists.map(d => (
                  <DentistResultCard key={d.id} dentist={d} treatmentNote={noteFor(d)} />
                ))}
              </div>
            ) : (
              <p style={p}>We&apos;re adding implant dentists in {C}. Meanwhile, browse all dentists below.</p>
            )}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {liveAreas.map(a => (
                <Link key={a.slug} href={`/area/${a.slug}/${SLUG}`} style={{
                  padding: '9px 16px', background: '#F0FDFA', color: TEAL,
                  border: '1px solid #99F6E4', borderRadius: 20, fontSize: 13.5, fontWeight: 600,
                }}>Implants in {a.name}</Link>
              ))}
            </div>
            <p style={{ marginTop: 16 }}>
              <Link href={`/dentists?treatment=${SLUG}`} style={{ color: TEAL, fontWeight: 700, fontSize: 15 }}>
                See all {totalOffering > 0 ? `${totalOffering} ` : ''}dentists offering implants in {C} →
              </Link>
            </p>
          </div>

          {/* FAQ */}
          <div style={card}>
            <h2 style={h2}>Questions patients ask</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {faqs.map(f => (
                <div key={f.q}>
                  <h3 style={h3}>{f.q}</h3>
                  <p style={{ ...p, marginBottom: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ABOUT THESE PRICES */}
          <div style={{ ...card, marginBottom: 0, background: '#F8FAFC' }}>
            <h2 style={{ ...h2, fontSize: 18 }}>About these prices</h2>
            <p style={{ ...p, marginBottom: 0 }}>
              Ranges come from published {C} clinic prices and the fees DentistIn dentists list on their profiles,
              November 2026. Your cost depends on your case. This page is general information, not a diagnosis; your
              dentist will advise after a check-up.
              {lowestFee !== null ? ` The lowest published implant fee in ${C} right now is ${inr(lowestFee)}.` : ''}
            </p>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer style={{ background: '#0A1628', padding: '40px 20px 24px', color: 'rgba(255,255,255,0.6)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#fff', fontSize: 15 }}>{city.domain}</Link>
            <div style={{ display: 'flex', gap: 20 }}>
              <Link href="/dentists" style={{ fontSize: 13 }}>Find Dentists</Link>
              <Link href="/for-dentists" style={{ fontSize: 13 }}>For Dentists</Link>
              <Link href="/about" style={{ fontSize: 13 }}>About</Link>
            </div>
            <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain}</p>
          </div>
        </div>
      </footer>
    </>
  )
}
