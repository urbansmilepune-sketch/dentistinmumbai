import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCityBySlug, getCityByDomain, cityOrigin, cityBrandName } from '@/config/cities'
import SiteHeader from '@/components/SiteHeader'
import DentistResultCard from '@/components/DentistResultCard'
import LocalFeeGuide from '@/app/area/[slug]/LocalFeeGuide'
import ShowMoreButton from '@/app/area/[slug]/ShowMoreButton'
import AreaFAQAccordion from '@/app/area/[slug]/AreaFAQAccordion'
import { dentistCountLabel } from '@/lib/dentistCount'
import { isOpenNowFromHours } from '@/lib/time'
import { NAVY, NAVY_SOFT, TEAL } from '@/app/dentist/[slug]/profileTheme'

// PCMC (Pimpri-Chinchwad Municipal Corporation) umbrella landing page. NOT an
// `areas` row — it aggregates the constituent PCMC sub-locality areas into one
// SEO-targeted cluster page ("best dentist pimpri-chinchwad", ~6,400 GSC
// impressions at position 34, Nov 2026). Pune-only: served on dentistinpune.in
// and guarded to 404 on every other city domain (the route exists on all of
// them since it's a static path).
//
// Every number and most of the text below is built from the live dentist rows
// (treatment fees, per-area lines, FAQ answers), so the page carries content no
// other page has.
export const dynamic = 'force-dynamic'

// Core PCMC areas by id (verified live). IDs are stable across slug renames.
const PCMC_AREAS = [
  { slug: 'wakad',                   name: 'Wakad',     id: 'e6e610b7-fbe5-497e-9b63-e1b538621c31' },
  { slug: 'chinchwad',               name: 'Chinchwad', id: 'f223e687-f342-4b5d-9b51-db3612edf670' },
  { slug: 'ravet',                   name: 'Ravet',     id: '3868b920-4ba8-4253-8183-56dd428ddaed' },
  { slug: 'pimpri',                  name: 'Pimpri',    id: 'e1f4a081-66ff-4028-abe7-cdea0b748c00' },
  { slug: 'akurdi-pimpri-chinchwad', name: 'Akurdi',    id: 'deb69720-1a06-44c7-937a-0da59a07003d' },
  { slug: 'punawale',                name: 'Punawale',  id: '96a7aadb-88a8-4e4c-9983-c1ebe1e5c62c' },
  { slug: 'moshi',                   name: 'Moshi',     id: '1688a248-ae78-47c6-8510-662fe45bcbe1' },
  { slug: 'bhosari',                 name: 'Bhosari',   id: 'd433a2a6-aff0-4979-b0c6-c42fccd55fda' },
] as const

// More PCMC localities (Ashish OK, 6 Nov 2026). Their area ids weren't checked
// from here, so they are matched by name against Pune's areas table at request
// time; a locality with no matching row is simply skipped. Hinjewadi is left
// out on purpose: it is mostly under PMRDA, not PCMC.
const EXTRA_PCMC_NAMES = ['nigdi', 'pimple saudagar', 'thergaon', 'sangvi', 'new sangvi', 'chikhali', 'kalewadi']

type PcmcArea = { id: string; slug: string; name: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim()

async function getPcmcAreas(supabase: Awaited<ReturnType<typeof createClient>>): Promise<PcmcArea[]> {
  const fixed: PcmcArea[] = PCMC_AREAS.map(a => ({ id: a.id, slug: a.slug, name: a.name }))
  const { data, error } = await supabase.from('areas').select('id, slug, name').eq('city', 'pune')
  if (error) {
    console.error('[pcmc] areas lookup failed', error.message)
    return fixed
  }
  const fixedIds = new Set(fixed.map(a => a.id))
  const extras = ((data || []) as PcmcArea[])
    .filter(a => !fixedIds.has(String(a.id)) && EXTRA_PCMC_NAMES.includes(norm(a.name)))
    .map(a => ({ id: String(a.id), slug: a.slug, name: a.name }))
  return [...fixed, ...extras]
}

// Pune is authoritative for this page's brand/URL (it's a Pune-only cluster);
// the request-header check below governs whether we render at all.
const PUNE = getCityBySlug('pune')
const PCMC_LABEL = 'Pimpri-Chinchwad (PCMC)'

const DENTIST_SELECT = `
  id, slug, name, clinic_name, qualifications, experience_years,
  gender, consultation_fee, emi_available, is_verified, tier,
  profile_photo, whatsapp, phone, working_hours, lat, lng,
  avg_rating, review_count, area_id,
  areas(name, slug),
  dentist_treatments(fee_from, fee_to, treatments(name, slug))
`

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const areas = await getPcmcAreas(supabase)
  const { count } = await supabase
    .from('dentists')
    .select('id', { count: 'exact', head: true })
    .in('area_id', areas.map(a => a.id))
    .eq('is_active', true)
    .eq('city', 'pune')
  const n = count || 0
  const top = areas.slice(0, 4).map(a => a.name).join(', ')
  return {
    // No brand suffix here: the root layout's title template appends the domain.
    title: n > 0
      ? `Best Dentists in Pimpri-Chinchwad (PCMC): ${n} Verified, Compare Fees`
      : 'Best Dentists in Pimpri-Chinchwad (PCMC): Compare Fees',
    description: `${n > 0 ? `${n} verified dentists` : 'Verified dentists'} across ${top} and ${Math.max(areas.length - 4, 0)} more PCMC areas. Compare fees, Sunday hours and EMI, then book or WhatsApp free.`,
    alternates: { canonical: `${cityOrigin(PUNE)}/pcmc` },
  }
}

type Row = {
  id: string
  name: string
  gender?: string | null
  consultation_fee?: number | null
  emi_available?: boolean | null
  working_hours?: { sun?: { is_open?: boolean } | null } | null
  area_id?: string | null
  dentist_treatments?: { fee_from: number | null; fee_to: number | null; treatments: { name: string; slug: string } | null }[]
}

export default async function PcmcPage() {
  const h = await headers()
  // Pune-only guard. Prefer the proxy-set slug; fall back to the host so a
  // dropped header on the Pune domain doesn't wrongly 404.
  const headerCity = getCityBySlug(h.get('x-city-slug'))
  const hostCity = getCityByDomain(h.get('x-forwarded-host') || h.get('host'))
  if (headerCity.citySlug !== 'pune' && hostCity.citySlug !== 'pune') notFound()

  const origin = cityOrigin(PUNE)
  const supabase = await createClient()
  const pcmcAreas = await getPcmcAreas(supabase)
  const { data: dentistsRaw, error } = await supabase
    .from('dentists')
    .select(DENTIST_SELECT)
    .in('area_id', pcmcAreas.map(a => a.id))
    .eq('is_active', true)
    .eq('city', 'pune')
    .order('rank_score', { ascending: false })
    .limit(500)
  if (error) console.error('[pcmc] dentists query failed', error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (dentistsRaw || []) as any[]
  const rows = list as Row[]
  const totalCount = list.length

  // Consultation fee stats (0/NULL excluded as the "unset" sentinel).
  const fees = rows.map(d => d.consultation_fee).filter((f): f is number => typeof f === 'number' && f > 0)
  const pricedCount = fees.length
  const avgFee = pricedCount ? Math.round(fees.reduce((s, f) => s + f, 0) / pricedCount) : null
  const lowestFee = pricedCount ? Math.min(...fees) : null
  const highestFee = pricedCount ? Math.max(...fees) : null
  const openNowCount = list.filter(d => isOpenNowFromHours(d.working_hours)).length
  const sundayCount = rows.filter(d => d.working_hours?.sun?.is_open).length
  const emiCount = rows.filter(d => d.emi_available).length

  // Per-area facts, derived from the fetched set (it already IS every active
  // dentist in these areas).
  const subAreas = pcmcAreas.map(a => {
    const inArea = rows.filter(d => String(d.area_id) === a.id)
    const f = inArea.map(d => d.consultation_fee).filter((x): x is number => typeof x === 'number' && x > 0)
    return {
      ...a,
      count: inArea.length,
      sunday: inArea.filter(d => d.working_hours?.sun?.is_open).length,
      emi: inArea.filter(d => d.emi_available).length,
      female: inArea.filter(d => String(d.gender || '').toLowerCase() === 'female').length,
      minFee: f.length ? Math.min(...f) : null,
    }
  }).filter(a => a.count > 0).sort((x, y) => y.count - x.count)

  // Treatment fees across PCMC: dentists offering each treatment and the
  // published fee range.
  const tMap = new Map<string, { name: string; slug: string; offering: number; feeCount: number; min: number; max: number }>()
  for (const d of rows) {
    for (const dt of d.dentist_treatments || []) {
      const t = dt.treatments
      if (!t?.slug) continue
      const cur = tMap.get(t.slug) ?? { name: t.name, slug: t.slug, offering: 0, feeCount: 0, min: Infinity, max: 0 }
      cur.offering++
      if (typeof dt.fee_from === 'number' && dt.fee_from > 0) {
        cur.feeCount++
        cur.min = Math.min(cur.min, dt.fee_from)
        cur.max = Math.max(cur.max, typeof dt.fee_to === 'number' && dt.fee_to > 0 ? dt.fee_to : dt.fee_from)
      }
      tMap.set(t.slug, cur)
    }
  }
  const treatmentRows = [...tMap.values()].sort((a, b) => b.offering - a.offering).slice(0, 8)
  const rct = tMap.get('root-canal')
  const feeText = (t: { feeCount: number; min: number; max: number }) =>
    t.feeCount === 0 ? 'Ask clinic' : t.max > t.min ? `${inr(t.min)} – ${inr(t.max)}` : `From ${inr(t.min)}`

  const areaNames = subAreas.map(a => a.name)
  const areaListText = areaNames.length > 1 ? `${areaNames.slice(0, -1).join(', ')} and ${areaNames[areaNames.length - 1]}` : areaNames.join('')

  const faqs = [
    {
      q: 'Who is the best dentist in Pimpri-Chinchwad?',
      a: `${totalCount > 0 ? `${totalCount} verified dentists practise` : 'Verified dentists practise'} across PCMC on ${PUNE.domain}. Compare their qualifications, experience, fees and reviews on this page. No dentist pays to be listed higher.`,
    },
    {
      q: 'How much does a dentist consultation cost in PCMC?',
      a: avgFee !== null && lowestFee !== null && highestFee !== null
        ? `Published consultation fees in Pimpri-Chinchwad range from ${inr(lowestFee)} to ${inr(highestFee)}, with an average of ${inr(avgFee)} across ${plural(pricedCount, 'dentist', 'dentists')} who list a fee.`
        : 'Most PCMC clinics confirm the consultation fee when you book. Ask the clinic on WhatsApp before your visit.',
    },
    {
      q: 'How much does a root canal cost in Pimpri-Chinchwad?',
      a: rct && rct.feeCount > 0
        ? `${plural(rct.offering, 'PCMC dentist offers', 'PCMC dentists offer')} root canal treatment; those who publish a fee charge ${rct.max > rct.min ? `${inr(rct.min)} to ${inr(rct.max)}` : `from ${inr(rct.min)}`} per tooth. A crown is usually extra.`
        : 'Root canal treatment in Pune usually costs ₹3,000 to ₹8,000 per tooth, plus a crown. Ask PCMC clinics for a written estimate.',
    },
    {
      q: 'Is any dentist open on Sunday in PCMC?',
      a: sundayCount > 0
        ? `Yes, ${plural(sundayCount, 'clinic lists', 'clinics list')} Sunday hours in Pimpri-Chinchwad${subAreas.find(a => a.sunday > 0) ? `, including in ${subAreas.filter(a => a.sunday > 0).slice(0, 2).map(a => a.name).join(' and ')}` : ''}.`
        : 'None of the PCMC clinics listed here shows Sunday hours yet. Check each profile for the latest timings.',
    },
    {
      q: 'Can I pay for dental treatment in EMI in Pimpri-Chinchwad?',
      a: emiCount > 0
        ? `${plural(emiCount, 'PCMC dentist offers', 'PCMC dentists offer')} EMI. Ask the clinic for the terms before treatment starts.`
        : 'No PCMC dentist on this page lists EMI yet. Ask the clinic directly; many arrange it for larger treatments.',
    },
    {
      q: 'Which PCMC areas are covered?',
      a: areaListText ? `${areaListText}.` : 'Wakad, Chinchwad, Pimpri, Ravet, Akurdi, Punawale, Moshi and Bhosari.',
    },
  ]

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: origin },
      { '@type': 'ListItem', position: 2, name: 'Dentists', item: `${origin}/dentists` },
      { '@type': 'ListItem', position: 3, name: PCMC_LABEL, item: `${origin}/pcmc` },
    ],
  }
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: `Dentists in ${PCMC_LABEL}`,
    areaServed: 'Pimpri-Chinchwad, Pune',
    url: `${origin}/pcmc`,
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }

  const stats = [
    { value: String(totalCount), label: totalCount === 1 ? 'dentist' : 'dentists' },
    { value: String(openNowCount), label: 'open now' },
    ...(lowestFee !== null && highestFee !== null
      ? [{ value: lowestFee !== highestFee ? `${inr(lowestFee)}–${inr(highestFee)}` : inr(lowestFee), label: 'consultation' }]
      : []),
  ]

  const leadParts = [
    totalCount > 0 ? `${totalCount} verified dentists across ${plural(subAreas.length, 'PCMC area', 'PCMC areas')}.` : 'Verified dentists across PCMC.',
    lowestFee !== null ? `Consultation from ${inr(lowestFee)}.` : '',
    sundayCount > 0 ? `${plural(sundayCount, 'clinic is', 'clinics are')} open on Sunday.` : '',
    emiCount > 0 ? `${emiCount} offer EMI.` : '',
    'Compare and book free.',
  ].filter(Boolean).join(' ')

  const visible = list.slice(0, 10)
  const hidden = list.slice(10)

  const h2 = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: NAVY, marginBottom: 12 } as const
  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(18px, 4vw, 28px)' } as const
  const th = { textAlign: 'left' as const, padding: '10px 10px', fontSize: 12.5, fontWeight: 700, color: NAVY, background: '#F8FAFC', borderBottom: '1px solid var(--border)' }
  const td = { padding: '10px 10px', fontSize: 14, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <SiteHeader city={PUNE} />

      {/* HERO — answer first */}
      <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '28px 20px 36px' }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.85)' }}>{PUNE.cityName}</Link>
            <span>›</span>
            <Link href="/dentists" style={{ color: 'rgba(255,255,255,0.85)' }}>Dentists</Link>
            <span>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>Pimpri-Chinchwad</span>
          </nav>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', color: '#fff', marginBottom: 10, lineHeight: 1.2 }}>
            Best Dentists in Pimpri-Chinchwad (PCMC)
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.6, marginBottom: 20, maxWidth: 720 }}>
            {leadParts}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {stats.map(stat => (
              <div key={stat.label} style={{
                display: 'inline-flex', alignItems: 'baseline', gap: 6,
                padding: '8px 14px', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12,
              }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: TEAL }}>{stat.value}</span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main style={{ background: 'var(--bg)', padding: '24px 16px 48px' }}>
        <div className="container" style={{ maxWidth: 860 }}>

          {/* Sub-area chips */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 }}>
              Areas in PCMC
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {subAreas.map(a => (
                <Link key={a.slug} href={`/area/${a.slug}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', background: '#fff', color: NAVY,
                  border: '1px solid var(--border)', borderRadius: 20, fontSize: 13, fontWeight: 600,
                }}>
                  📍 {a.name}
                  <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {dentistCountLabel(a.count)}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Treatment fees across PCMC */}
          {treatmentRows.length > 0 && (
            <div style={{ ...card, marginBottom: 28 }}>
              <h2 style={h2}>Treatment fees in Pimpri-Chinchwad</h2>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>
                Starting fees PCMC dentists publish on their profiles. Updates by itself.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Treatment</th><th style={th}>Dentists</th><th style={{ ...th, textAlign: 'right' }}>Fees</th></tr></thead>
                  <tbody>
                    {treatmentRows.map(t => (
                      <tr key={t.slug}>
                        <td style={td}><Link href={`/treatment/${t.slug}`} style={{ color: TEAL, fontWeight: 600 }}>{t.name}</Link></td>
                        <td style={td}>{t.offering}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: t.feeCount ? 700 : 400, color: t.feeCount ? NAVY : 'var(--muted)' }}>{feeText(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dentist list: 10 first, the rest behind a button */}
          <h2 style={h2}>Dentists in Pimpri-Chinchwad</h2>
          {list.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800, color: NAVY, marginBottom: 8 }}>
                We&apos;re adding dentists in Pimpri-Chinchwad soon
              </h2>
              <Link href="/dentists" className="btn btn-primary">Browse all {PUNE.cityName} dentists</Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {visible.map(d => <DentistResultCard key={d.id} dentist={d} />)}
              </div>
              <ShowMoreButton count={hidden.length} areaName="Pimpri-Chinchwad">
                {hidden.map(d => <DentistResultCard key={d.id} dentist={d} />)}
              </ShowMoreButton>
            </>
          )}

          {/* Live consultation fee guide across the cluster */}
          <div style={{ marginTop: 40 }}>
            <LocalFeeGuide
              areaName={PCMC_LABEL}
              totalCount={totalCount}
              pricedCount={pricedCount}
              avgFee={avgFee}
              minFee={lowestFee}
              maxFee={highestFee}
            />
          </div>

          {/* Area by area — one line of live facts per locality */}
          {subAreas.length > 0 && (
            <div style={{ ...card, marginTop: 40 }}>
              <h2 style={h2}>Dentists in each PCMC area</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {subAreas.map(a => {
                  const bits: string[] = []
                  if (a.sunday > 0) bits.push(`${a.sunday} open on Sunday`)
                  if (a.minFee !== null) bits.push(`consultation from ${inr(a.minFee)}`)
                  if (a.emi > 0) bits.push(`${a.emi} offer EMI`)
                  if (a.female > 0) bits.push(plural(a.female, 'woman dentist', 'women dentists'))
                  return (
                    <div key={a.slug}>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
                        <Link href={`/area/${a.slug}`} style={{ color: TEAL }}>Dentists in {a.name}</Link>
                      </h3>
                      <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                        {plural(a.count, 'dentist', 'dentists')}{bits.length ? `: ${bits.slice(0, 3).join(', ')}` : ''}.
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* FAQ */}
          <div style={{ marginTop: 40 }}>
            <h2 style={h2}>Questions patients ask</h2>
            <AreaFAQAccordion items={faqs} />
          </div>

          {/* SEO content */}
          <div style={{ ...card, marginTop: 40 }}>
            <h2 style={h2}>Finding a dentist in Pimpri-Chinchwad (PCMC)</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
              Pimpri-Chinchwad is Pune&apos;s twin city{areaListText ? `, spanning ${areaListText}` : ''}. Whether you need a
              routine check-up, a family dental clinic, braces or dental implants in PCMC, this page brings every
              verified {cityBrandName(PUNE)} listing across the PCMC belt into one place so you can compare fees and
              reviews before you book.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, margin: 0 }}>
              Tap any area above to see dentists in that locality, or open a treatment to compare its cost across Pune.
            </p>
          </div>
        </div>
      </main>

      <footer style={{ background: '#0A1628', padding: '32px 20px', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
        <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {PUNE.domain}</p>
      </footer>
    </>
  )
}
