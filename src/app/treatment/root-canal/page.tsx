import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, cityOrigin } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import MedicalReviewBadge from '@/components/MedicalReviewBadge'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// Bespoke, medically-reviewed landing page for Root Canal Treatment. This is a
// STATIC route segment (/treatment/root-canal) that intentionally overrides the
// dynamic /treatment/[slug] template for this one slug — the editorial content,
// crown-cost guidance, FAQ, and E-E-A-T review byline are hand-authored and
// can't come from the generic template. Every other treatment still renders via
// [slug].
//
// City-aware, like the rest of the public site: the canonical, hero city name,
// the live fee table, and the "find a dentist" links all resolve from the
// current domain (x-city-slug). The RCT education and the Dr. Dighade review
// byline are constant across cities. headers() forces dynamic rendering.
export const dynamic = 'force-dynamic'

const SLUG = 'root-canal'
const AUTHOR_PATH = '/authors/dr-manish-dighade'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const C = city.cityName
  return {
    title: `Root Canal Treatment (RCT) Cost in ${C} — Real Fees from Verified Dentists (2026)`,
    description: `Root canal treatment (RCT) cost in ${C} ranges from ₹3,000 to ₹8,000 per tooth. Compare real fees from verified dentists across ${C}. Single-sitting RCT available.`,
    alternates: { canonical: `${cityOrigin(city)}/treatment/${SLUG}` },
    robots: { index: true, follow: true },
  }
}

type FeeRow = {
  id: string
  areas: { name: string; slug: string } | null
  dentist_treatments: { fee_from: number | null; fee_to: number | null }[]
}

type AreaAgg = { name: string; slug: string; offering: number; feeCount: number; minFrom: number; maxTo: number }

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default async function RootCanalPage() {
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const C = city.cityName
  const origin = cityOrigin(city)
  const citySlug = city.citySlug

  const { data: treatment } = await supabase.from('treatments').select('id, name').eq('slug', SLUG).single()
  if (!treatment) notFound()

  // Live fee data: dentists in THIS city offering root canal, with their
  // published fee range + area. dentist_treatments!inner + the treatment_id
  // filter narrows to matching dentists and embeds just this treatment's fees.
  const { data: rowsRaw } = await supabase
    .from('dentists')
    .select('id, areas(name, slug), dentist_treatments!inner(fee_from, fee_to, treatment_id)')
    .eq('is_active', true)
    .eq('city', citySlug)
    .eq('dentist_treatments.treatment_id', treatment.id)
    .limit(1000)
  const rows = (rowsRaw || []) as unknown as FeeRow[]

  // Aggregate by area. `offering` counts every dentist listing RCT; `feeCount`
  // only those with a published fee_from (which drives the live-fee table).
  const areaMap = new Map<string, AreaAgg>()
  for (const r of rows) {
    const a = r.areas
    if (!a?.slug) continue
    const cur = areaMap.get(a.slug) ?? { name: a.name, slug: a.slug, offering: 0, feeCount: 0, minFrom: Infinity, maxTo: 0 }
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
  const offeringAreas = allAreas
    .filter(a => a.offering > 0)
    .sort((x, y) => y.offering - x.offering)
    .slice(0, 3)
  const totalOffering = rows.length
  const lowestFee = feeAreas.length ? Math.min(...feeAreas.map(a => a.minFrom)) : null

  const feeRange = (a: AreaAgg) => (a.maxTo > a.minFrom ? `${inr(a.minFrom)} – ${inr(a.maxTo)}` : `From ${inr(a.minFrom)}`)

  const faqs = [
    { q: `What is the cost of root canal treatment in ${C}?`, a: `Root canal treatment (RCT) in ${C} costs between ₹3,000 and ₹8,000 per tooth depending on the tooth type and clinic location. Front teeth are typically cheaper (₹3,000–₹5,000) while molars cost more (₹5,000–₹8,000). These fees are for the RCT procedure only — a dental crown is usually needed after and costs an additional ₹3,000–₹15,000.` },
    { q: `Is single-sitting RCT available in ${C}?`, a: `Yes, single-sitting root canal treatment is available at many dental clinics in ${C}. It is suitable for most cases where the infection is not severe. Multi-sitting RCT (2–3 visits) is recommended for heavily infected teeth or complex root canal anatomy.` },
    { q: `Do I need a crown after root canal treatment?`, a: `Yes, a dental crown is strongly recommended after root canal treatment, especially for back teeth (premolars and molars). RCT removes the pulp and makes the tooth brittle — a crown protects it from cracking under chewing pressure. Crown costs in ${C} range from ₹3,000 (metal) to ₹15,000 (zirconia). Ask your dentist to quote both RCT and crown together.` },
    { q: `How many sittings does root canal treatment take?`, a: `Single-sitting RCT can be completed in one visit of 60–90 minutes. Multi-sitting RCT takes 2–3 visits over 1–2 weeks. Your dentist will assess the severity of infection and root complexity before deciding.` },
    { q: `Is root canal treatment painful?`, a: `Root canal treatment is performed under local anaesthesia and should not be painful during the procedure. Some soreness for 2–3 days after is normal. Most patients report the procedure is no more uncomfortable than a routine filling.` },
    { q: `What is the difference between RCT and tooth extraction?`, a: `Root canal treatment saves the natural tooth by removing the infected pulp. Extraction removes the tooth entirely. Dentists recommend saving the natural tooth wherever possible — a gap left by extraction can cause neighbouring teeth to shift, affecting bite and requiring a bridge or implant later, which costs significantly more.` },
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: `Root Canal Treatment (RCT) Cost in ${C}`,
    description: `Root canal treatment cost in ${C} ranges from ₹3,000 to ₹8,000 per tooth. Compare verified fees from dentists across ${C}.`,
    url: `${origin}/treatment/${SLUG}`,
    medicalAudience: { '@type': 'MedicalAudience', audienceType: 'Patient' },
    reviewedBy: { '@type': 'Person', name: 'Dr. Manish Dighade', identifier: 'MSDC A-24630', url: `${origin}${AUTHOR_PATH}` },
    lastReviewed: '2026-07-09',
    about: { '@type': 'MedicalProcedure', name: 'Root Canal Treatment', alternateName: 'RCT', procedureType: 'Therapeutic' },
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }

  // Shared inline style tokens.
  const h2 = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: NAVY, margin: '0 0 16px' } as const
  const h3 = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: NAVY, margin: '0 0 10px' } as const
  const p = { fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 } as const
  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 32, marginBottom: 24 } as const
  const th = { textAlign: 'left' as const, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, color: NAVY, background: '#F8FAFC', borderBottom: '1px solid var(--border)' }
  const td = { padding: '10px 14px', fontSize: 14, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }

  const toothCosts: [string, string][] = [
    ['Front teeth (incisors, canines)', '₹3,000 – ₹5,000'],
    ['Premolars', '₹4,000 – ₹6,500'],
    ['Molars (back teeth)', '₹5,000 – ₹8,000'],
  ]
  const crownCosts: [string, string][] = [
    ['Metal (PFM) crown', '₹3,000 – ₹5,000'],
    ['Ceramic / Tooth-coloured crown', '₹5,000 – ₹10,000'],
    ['Zirconia crown', '₹8,000 – ₹15,000'],
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <SiteHeader city={city} />

      {/* HERO */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{C}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Treatments</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Root Canal Treatment</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.5rem, 4.5vw, 2.2rem)', color: '#fff', marginBottom: 16, lineHeight: 1.25 }}>
            Root Canal Treatment (RCT) Cost in {C} — Real Fees from Verified Dentists (2026)
          </h1>

          <div style={{ maxWidth: 720 }}>
            <MedicalReviewBadge
              name="Dr. Manish Dighade"
              credentials="BDS, Fellowship in Dental Implantology"
              registration="MSDC Reg. A-24630"
              profileUrl={AUTHOR_PATH}
              reviewDate="July 2026"
            />
          </div>
        </div>
      </section>

      <main style={{ background: 'var(--bg)', padding: '32px 20px 48px' }}>
        <div className="container" style={{ maxWidth: 860 }}>

          <p style={{ ...p, fontSize: 16 }}>
            Root canal treatment — commonly called RCT — is one of the most searched dental procedures in {C}, and one
            of the most misunderstood. Most patients come in worried about pain and cost. This page gives you the actual
            numbers from verified {C} dentists, explains what the procedure involves in plain language, and tells you
            what questions to ask before you book.
          </p>

          {/* COST */}
          <div style={card}>
            <h2 style={h2}>RCT Cost in {C} (2026)</h2>
            <p style={p}>
              Root canal treatment in {C} typically costs between <strong>₹3,000 and ₹8,000 per tooth</strong>. The
              variation depends on which tooth is being treated, the number of root canals in that tooth, and the clinic.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead><tr><th style={th}>Tooth type</th><th style={th}>Typical RCT cost in {C}</th></tr></thead>
              <tbody>
                {toothCosts.map(([k, v]) => (
                  <tr key={k}><td style={td}>{k}</td><td style={td}>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...p, marginBottom: 0, fontSize: 14, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
              <strong>Important:</strong> these are RCT-only fees. A dental crown is usually needed after RCT and is
              charged separately. See the crown cost section below.
            </p>
          </div>

          {/* LIVE FEE DATA — dynamic */}
          <div style={card}>
            <h2 style={h2}>Live fee data from DentistIn-verified dentists in {C}</h2>
            <p style={p}>
              The fees below come directly from dentists registered on DentistIn who have published their root canal
              charges. This data updates as more dentists join.
            </p>
            {feeAreas.length > 0 ? (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Area</th><th style={th}>RCT fee range</th><th style={th}>Dentists with published fees</th></tr></thead>
                  <tbody>
                    {feeAreas.map(a => (
                      <tr key={a.slug}>
                        <td style={td}><Link href={`/area/${a.slug}/${SLUG}`} style={{ color: TEAL, fontWeight: 600 }}>{a.name}</Link></td>
                        <td style={td}>{feeRange(a)}</td>
                        <td style={td}>{a.feeCount} {a.feeCount === 1 ? 'dentist' : 'dentists'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', margin: '12px 0 0' }}>
                  Fees last updated: July 2026. <Link href={`/dentists?treatment=${SLUG}`} style={{ color: TEAL }}>See all dentists offering root canal in {C} →</Link>
                </p>
              </>
            ) : (
              <div style={{ background: '#F8FAFC', border: '1px dashed var(--border)', borderRadius: 12, padding: '20px', fontSize: 14, color: 'var(--text-secondary)' }}>
                {totalOffering > 0 ? (
                  <>We list <strong>{totalOffering}</strong> {totalOffering === 1 ? 'dentist' : 'dentists'} offering root canal in {C}. Published fee ranges are being collected as dentists add their charges — check back soon, or </>
                ) : (
                  <>We&apos;re onboarding root canal specialists in {C}. Meanwhile, </>
                )}
                <Link href={`/dentists?treatment=${SLUG}`} style={{ color: TEAL, fontWeight: 600 }}>see all dentists offering root canal in {C} →</Link>
              </div>
            )}
          </div>

          {/* WHAT IS RCT */}
          <div style={card}>
            <h2 style={h2}>What is Root Canal Treatment?</h2>
            <p style={p}>
              A tooth has a soft inner core called the pulp — it contains nerves and blood vessels. When the pulp
              becomes infected (due to deep decay, a crack, or trauma), the infection causes pain and can spread to
              surrounding bone if untreated.
            </p>
            <p style={p}>
              Root canal treatment removes the infected pulp, cleans and shapes the hollow canals inside the root, fills
              them with a rubber-like material called gutta-percha, and seals the tooth. The tooth remains in place and
              functions normally — it just no longer has a living nerve, so you will not feel temperature sensations in it.
            </p>
            <p style={{ ...p, marginBottom: 0 }}>RCT is not an extraction. The goal is to <strong>save the tooth</strong>.</p>
          </div>

          {/* SINGLE VS MULTI */}
          <div style={card}>
            <h2 style={h2}>Single-Sitting vs Multi-Sitting RCT</h2>
            <p style={p}>This is the question most {C} patients ask when booking.</p>
            <p style={{ ...p, marginBottom: 8 }}><strong>Single-sitting RCT</strong> completes the entire procedure in one visit of 60–90 minutes. It is suitable when:</p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9 }}>
              <li>The infection is mild to moderate</li>
              <li>The tooth has straightforward root canal anatomy</li>
              <li>There is no active abscess draining</li>
            </ul>
            <p style={{ ...p, marginBottom: 8 }}><strong>Multi-sitting RCT</strong> takes 2–3 visits over 1–2 weeks. It is recommended when:</p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9 }}>
              <li>The tooth has severe infection or a dental abscess</li>
              <li>The root canals are complex or curved (common in molars)</li>
              <li>The patient has a systemic condition that affects healing</li>
            </ul>
            <p style={{ ...p, marginBottom: 0 }}>
              Both approaches have the same long-term outcome when done correctly. Single-sitting is not a shortcut — it
              is clinically appropriate for most cases. Ask your dentist at the first visit which approach suits your
              specific tooth.
            </p>
          </div>

          {/* CROWN */}
          <div style={card}>
            <h2 style={h2}>Do You Need a Crown After RCT?</h2>
            <p style={{ ...p, fontWeight: 700, color: NAVY }}>Yes — and this is the cost most patients forget to ask about.</p>
            <p style={p}>
              After root canal treatment, the tooth loses its blood supply and becomes brittle. Without a crown, a back
              tooth (molar or premolar) is at high risk of fracturing under chewing pressure — which can mean losing the
              tooth entirely, making the RCT investment worthless.
            </p>
            <p style={{ ...p, fontWeight: 600, color: NAVY, marginBottom: 10 }}>Crown costs in {C}:</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead><tr><th style={th}>Crown type</th><th style={th}>Typical cost in {C}</th></tr></thead>
              <tbody>
                {crownCosts.map(([k, v]) => (
                  <tr key={k}><td style={td}>{k}</td><td style={td}>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ ...p, fontSize: 14, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
              <strong>When asking for an RCT quote, always ask: &ldquo;What will the crown cost on top of this?&rdquo;</strong> A
              ₹4,000 RCT quote that needs an ₹8,000 zirconia crown is a ₹12,000 total treatment — plan your budget accordingly.
            </p>
            <p style={{ ...p, marginBottom: 0 }}>For front teeth, a crown is still recommended but less urgent since front teeth bear less chewing load.</p>
          </div>

          {/* PAIN */}
          <div style={card}>
            <h2 style={h2}>Is RCT Painful?</h2>
            <p style={p}>
              Root canal treatment has a reputation for being painful that is largely outdated. The procedure is
              performed under <strong>local anaesthesia</strong> — the area is numb before any instrument touches the tooth.
            </p>
            <p style={p}><strong>During the procedure:</strong> you should feel pressure but not pain. If you feel sharp pain, tell your dentist immediately — you may need more anaesthetic.</p>
            <p style={p}><strong>After the procedure:</strong> some soreness and mild sensitivity for 2–3 days is normal as the surrounding tissue settles. Over-the-counter pain relief (ibuprofen or paracetamol) is usually sufficient. Severe or worsening pain after 3 days warrants a follow-up call to your dentist.</p>
            <p style={{ ...p, marginBottom: 0 }}>Most patients who have had RCT describe the experience as no worse than getting a filling.</p>
          </div>

          {/* RCT VS EXTRACTION */}
          <div style={card}>
            <h2 style={h2}>RCT vs Extraction — Which Should You Choose?</h2>
            <p style={p}>If a dentist recommends extraction instead of RCT, it is worth asking whether saving the tooth is possible. Reasons a dentist may recommend extraction:</p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9 }}>
              <li>The tooth is not restorable (too little tooth structure left for a crown)</li>
              <li>Severe bone loss around the root</li>
              <li>A vertical root fracture (the root is cracked lengthwise)</li>
            </ul>
            <p style={p}>If none of these apply, saving the natural tooth is almost always the better long-term decision. A missing tooth:</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.9 }}>
              <li>Causes neighbouring teeth to drift over months and years</li>
              <li>Reduces chewing efficiency</li>
              <li>Eventually requires a dental implant (₹25,000–₹60,000) or bridge (₹15,000–₹25,000) to replace — far more expensive than RCT + crown</li>
            </ul>
          </div>

          {/* FIND A DENTIST */}
          <div style={card}>
            <h2 style={h2}>Find a Root Canal Dentist in {C}</h2>
            <p style={p}>DentistIn lists verified dentists offering root canal treatment across {C}, with published fee ranges where available.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {offeringAreas.map(a => (
                <Link key={a.slug} href={`/area/${a.slug}/${SLUG}`} style={{ color: TEAL, fontWeight: 600, fontSize: 15 }}>
                  Root canal dentists in {a.name} →
                </Link>
              ))}
              <Link href={`/dentists?treatment=${SLUG}`} style={{ color: TEAL, fontWeight: 600, fontSize: 15 }}>
                All dentists offering RCT in {C} →
              </Link>
            </div>
          </div>

          {/* FAQ */}
          <div style={card}>
            <h2 style={h2}>Frequently Asked Questions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {faqs.map(f => (
                <div key={f.q}>
                  <h3 style={h3}>{f.q}</h3>
                  <p style={{ ...p, marginBottom: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* MEDICAL REVIEW NOTE */}
          <div style={{ ...card, marginBottom: 0, background: '#F8FAFC' }}>
            <h2 style={{ ...h2, fontSize: 18 }}>Medical Review Note</h2>
            <p style={p}>
              This page has been reviewed for clinical accuracy by <strong>Dr. Manish Dighade</strong> (BDS, Fellowship
              in Dental Implantology, MSDC Reg. A-24630), practicing implantologist at Urban Smile Orthodontic and Dental
              Implant Centre, Wakad, Pune.
            </p>
            <p style={p}>
              Fee data is sourced directly from dentists registered on DentistIn and reflects published rates as of July
              2026. Fees may vary by dentist and case complexity — always confirm with your clinic before booking.
              {lowestFee !== null ? ` The lowest published root canal fee in ${C} right now is ${inr(lowestFee)}.` : ''}
            </p>
            <p style={{ margin: 0 }}>
              <Link href={AUTHOR_PATH} style={{ color: TEAL, fontWeight: 700 }}>About Dr. Manish Dighade →</Link>
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
