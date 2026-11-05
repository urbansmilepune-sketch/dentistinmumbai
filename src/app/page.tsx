import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityHomeData, getCityHomeStats, getHomeSpotlightDentists, getHomeReviews } from '@/lib/cache/public-pages'
import SiteHeader from '@/components/SiteHeader'
import { NeedProvider, NeedHero, NeedSpotlight } from '@/components/home/HomeNeed'
import DentistResultCard from '@/components/DentistResultCard'
import FaqAccordion from '@/components/FaqAccordion'
import { CITY_CONFIGS, NATIONAL_ORIGIN, cityOrigin, getCityBySlug, cityBrandName, isNationalHost } from '@/config/cities'
import NationalHome from '@/components/national/NationalHome'
import CitiesFooterLinks from '@/components/CitiesFooterLinks'
import PopularSearches from '@/components/PopularSearches'
import { NAVY, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'
import { getOpenStatus } from '@/lib/openStatus'
import { plausibleFromFee } from '@/lib/treatmentPrices'

// Per-host metadata. dentistinindia.in gets network-framed copy; every
// city domain gets a "Dentist in <City>" search title tuned for the
// "dentist in <city>" intent. proxy.ts has already tagged the request
// with x-is-national / x-city-slug by the time this runs.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  if (h.get('x-is-national') === '1' || isNationalHost(h.get('x-forwarded-host') || h.get('host'))) {
    const liveCityCount = Object.keys(CITY_CONFIGS).length
    return {
      title: `DentistIn India | Find a Verified Dentist in Your City | ${liveCityCount} Cities`,
      description: `Find verified dentists across ${liveCityCount} Indian cities. Pick your city to browse clinics, compare fees and book an appointment.`,
      alternates: { canonical: NATIONAL_ORIGIN },
      openGraph: {
        title: 'DentistIn India | Find a Verified Dentist in Your City',
        description: `Verified dentists across ${liveCityCount} Indian cities. Pick your city to browse clinics and book an appointment.`,
        url: NATIONAL_ORIGIN,
        siteName: 'Dentist In India',
        locale: 'en_IN',
        type: 'website',
      },
      robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    }
  }

  const city = getCityBySlug(h.get('x-city-slug'))
  const origin = cityOrigin(city)
  const brand = cityBrandName(city) // e.g. DentistInPune
  return {
    title: `Dentist in ${city.cityName} | Book Verified Dentists | ${brand}`,
    description: `Find and book the best dentists in ${city.cityName}. Registration-checked clinics, fees shown upfront, free online booking. Book your dental appointment today.`,
    keywords: `dentist in ${city.cityName}, dental clinic ${city.cityName}, best dentist ${city.cityName}, dental implants ${city.cityName}, root canal ${city.cityName}, teeth whitening ${city.cityName}, orthodontist ${city.cityName}`,
    alternates: { canonical: `${origin}/` },
    openGraph: {
      title: `Dentist in ${city.cityName} | ${brand}`,
      description: `Book verified dentists in ${city.cityName} online. Compare fees and timings, book free.`,
      url: `${origin}/`,
      siteName: brand,
      locale: 'en_IN',
      type: 'website',
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

function faqItemsFor(cityName: string) {
  return [
    {
      q: 'What does "verified" mean?',
      a: "Before a profile goes live we check the dentist's registration number with the State Dental Council, and confirm the clinic address and phone. The registration number is shown on the dentist's profile so you can check it yourself.",
    },
    {
      q: 'Is booking free?',
      a: "Yes. You don't pay us anything to search or book. You pay the dentist at the clinic for your treatment.",
    },
    {
      q: `How much does a dental check-up cost in ${cityName}?`,
      a: `Most clinics in ${cityName} charge ₹200 to ₹500 for a consultation. Each dentist's fee is on their card and profile before you book.`,
    },
    {
      q: 'Can I see a dentist today?',
      a: "Each dentist's card shows whether the clinic is open now and its timings. Pick a time on the booking page and the clinic confirms on WhatsApp.",
    },
    {
      q: 'How do I cancel or change my appointment?',
      a: 'Use the link in your WhatsApp confirmation, or call the clinic from its profile.',
    },
    {
      q: 'I have tooth pain at night. What should I do?',
      a: 'Check the cards for a clinic that is still open, or call the clinic from its profile. For heavy bleeding, swelling of the face or trouble breathing, go to a hospital emergency.',
    },
    {
      q: 'Can reviews be fake?',
      a: "Only patients who booked and visited get a review link, sent on WhatsApp after the visit. Dentists can't write, edit or delete reviews.",
    },
  ]
}

const ZONE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Western: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  Central: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  South: { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
  'Navi Mumbai': { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
}

// "What do you need?" chips in the hero. Labels are how patients describe
// their need; each is matched to a treatment by NAME (lower-cased substring),
// so a chip silently drops out if a city has no such treatment. They link to
// the filtered dentist list, as the old intent tiles did.
const NEED_CHIPS: { label: string; match: string }[] = [
  { label: 'Tooth pain', match: 'root canal' },
  { label: 'Root canal', match: 'root canal' },
  { label: 'Teeth cleaning', match: 'cleaning' },
  { label: 'Braces & aligners', match: 'braces' },
  { label: 'Dental implants', match: 'implant' },
  { label: 'Tooth extraction', match: 'extraction' },
  { label: 'Kids dentist', match: 'kids' },
  { label: 'Wisdom tooth', match: 'wisdom' },
]

// Price list order: the treatments patients most often price-check first.
// Anything not listed here (or without a believable fee) goes into the
// "More treatments" link row underneath, so every treatment page keeps a
// homepage link.
const PRICE_ORDER = ['root canal', 'implant', 'crown', 'braces', 'cleaning', 'extraction', 'filling', 'whitening']
const PRICE_ROWS = 6

// Small stable hash so the "Open now" row rotates every hour instead of
// always showing the same top-ranked dentists.
function rotationKey(id: string, salt: string): number {
  let h = 2166136261
  const str = id + salt
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export default async function HomePage() {
  const h = await headers()
  // National parent (dentistinindia.in) gets a separate homepage that
  // surfaces the network of city sites rather than a single-city listing.
  // proxy.ts sets x-is-national:1 for that host; everything else falls
  // through to the city homepage below.
  if (h.get('x-is-national') === '1') {
    return <NationalHome />
  }

  const city = getCityBySlug(h.get('x-city-slug'))
  const brandName = cityBrandName(city)
  const FAQ_ITEMS = faqItemsFor(city.cityName)

  // Heavy Supabase reads live behind unstable_cache (5-min TTL). getCityHomeData
  // carries the area/treatment menus + the honest dentist count; getCityHomeStats
  // carries the live per-treatment fees and per-area dentist counts the
  // denormalized columns don't reliably hold. See src/lib/cache/public-pages.ts.
  const [{ areas, treatments, dentistCount }, stats, spotlightPool, reviews] = await Promise.all([
    getCityHomeData(city.citySlug),
    getCityHomeStats(city.citySlug),
    getHomeSpotlightDentists(city.citySlug),
    getHomeReviews(city.citySlug),
  ])

  const isMumbai = city.citySlug === 'mumbai'
  const areaCount = (id: number | string) => stats.areaDentistCount[String(id)] ?? 0
  const findTreatment = (match: string) => treatments.find(t => t.name.toLowerCase().includes(match))

  // Order areas by their LIVE dentist count so populated areas surface first
  // (areas.dentist_count is unmaintained, so the cached order can't be trusted).
  // Empty areas are left out: their /area page 404s, so linking them from the
  // homepage handed Google dead links.
  const areasByCount = [...areas]
    .filter(a => areaCount(a.id) > 0)
    .sort((a, b) => areaCount(b.id) - areaCount(a.id))

  // Mumbai groups areas by suburban-rail line; every other city renders one
  // chip list (their `zone` column doesn't carry the Western/Central split).
  const areaGroups = isMumbai
    ? [
        { zone: 'Western', list: areasByCount.filter(a => a.zone === 'Western').slice(0, 6) },
        { zone: 'Central', list: areasByCount.filter(a => a.zone === 'Central').slice(0, 6) },
        { zone: 'South', list: areasByCount.filter(a => a.zone === 'South').slice(0, 4) },
        { zone: 'Navi Mumbai', list: areasByCount.filter(a => a.zone === 'Navi Mumbai').slice(0, 4) },
      ].filter(g => g.list.length > 0)
    : [{ zone: null as string | null, list: areasByCount.slice(0, 16) }]

  // Hero chips → treatment slugs (skipping any the city doesn't have).
  const needChips = NEED_CHIPS
    .map(c => ({ label: c.label, t: findTreatment(c.match) }))
    .filter((c): c is { label: string; t: NonNullable<typeof c.t> } => !!c.t)

  // Price list: believable "from" price per treatment (implausibly low fees,
  // e.g. a consult fee typed into Braces, are skipped — src/lib/treatmentPrices.ts).
  const priced = treatments
    .map(t => ({ t, fee: plausibleFromFee(t.name, stats.treatmentFees?.[String(t.id)]) }))
    .filter((r): r is { t: typeof r.t; fee: number } => r.fee !== null)
  const priceRank = (name: string) => {
    const i = PRICE_ORDER.findIndex(m => name.toLowerCase().includes(m))
    return i === -1 ? PRICE_ORDER.length : i
  }
  const priceRows = [...priced].sort((a, b) => priceRank(a.t.name) - priceRank(b.t.name)).slice(0, PRICE_ROWS)
  const pricedIds = new Set(priceRows.map(r => String(r.t.id)))
  const otherTreatments = treatments.filter(t => !pricedIds.has(String(t.id)))

  // Dentist row: dentists with a photo + fee, open ones first (IST), rotated
  // hourly so the same few don't always lead. With no need picked it shows 8;
  // each need in the hero swaps in up to 4 dentists who list that treatment.
  const hourSalt = new Date().toISOString().slice(0, 13)
  const ranked = spotlightPool
    .map(d => ({ d, open: getOpenStatus(d.working_hours).state === 'open', k: rotationKey(d.id, hourSalt) }))
    .sort((a, b) => (a.open === b.open ? a.k - b.k : a.open ? -1 : 1))
    .map(x => x.d)
  const defaultIds = ranked.slice(0, 8).map(d => d.id)
  const byTreatment: Record<string, string[]> = {}
  for (const c of needChips) {
    const tid = String(c.t.id)
    byTreatment[c.t.slug] = ranked
      .filter(d => (d.dentist_treatments ?? []).some(x => String(x.treatment_id) === tid))
      .slice(0, 4)
      .map(d => d.id)
  }
  const shownIds = new Set([...defaultIds, ...Object.values(byTreatment).flat()])
  const spotlightCards = ranked
    .filter(d => shownIds.has(d.id))
    .map(d => {
      // dentist_treatments here is ids only; the card reads names, so drop it.
      return { id: d.id, node: <DentistResultCard dentist={{ ...d, dentist_treatments: undefined, is_verified: !!d.is_verified }} /> }
    })

  // Reviews: real ones once there are enough to be meaningful, an explainer before.
  const REVIEWS_MIN = 10
  const showReviews = reviews.total >= REVIEWS_MIN && reviews.latest.length >= 3 && reviews.average !== null

  // MedicalOrganization JSON-LD for the city directory.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalOrganization',
    name: brandName,
    url: `https://${city.domain}`,
    description: `Verified dental directory for ${city.cityName}, India.`,
    areaServed: { '@type': 'City', name: city.cityName, address: { '@type': 'PostalAddress', addressCountry: 'IN' } },
    medicalSpecialty: 'Dentistry',
  }

  // WebSite + SearchAction wires up Google's sitelinks search box, submitting
  // to /search?q=… (the search page built alongside SiteHeader).
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brandName,
    url: `https://${city.domain}`,
    description: `Find verified dentists in ${city.cityName}`,
    potentialAction: {
      '@type': 'SearchAction',
      target: `https://${city.domain}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  // FAQPage JSON-LD — same treatment the area pages get, for FAQ rich results.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* NAV — shared header; the hero below carries the search box */}
      <SiteHeader city={city} hideSearch patientOnly />

      <main style={{ overflowX: 'hidden' }}>
        <NeedProvider>
          {/* HERO: what do you need → where → find, then a small trust line */}
          <NeedHero
            needs={needChips.map(c => ({ label: c.label, slug: c.t.slug }))}
            areas={areasByCount.map(a => ({ name: a.name, slug: a.slug }))}
            cityName={city.cityName}
            dentistCount={dentistCount}
          />

          {/* DENTIST ROW: follows the need picked in the hero */}
          <NeedSpotlight cityName={city.cityName} cards={spotlightCards} defaultIds={defaultIds} byTreatment={byTreatment} />
        </NeedProvider>

        {/* WHAT PATIENTS SAY: real reviews once there are enough, else how reviews work */}
        <section className="hm-sec" style={{ background: 'var(--bg)' }}>
          <div className="container">
            <div className="hm-head"><h2 className="hm-h2">What patients say</h2></div>
            {showReviews ? (
              <>
                <div className="hm-rsum">
                  <span className="hm-rbig">{reviews.average!.toFixed(1)}</span>
                  <span>
                    <Stars n={Math.round(reviews.average!)} />
                    <span className="hm-rnote">from {reviews.total} reviews · every one after a real visit</span>
                  </span>
                </div>
                <div className="hm-rvs">
                  {reviews.latest.slice(0, 3).map(r => (
                    <article key={r.id} className="hm-rc">
                      <Stars n={r.rating} />
                      <p className="hm-rtext">&ldquo;{r.review_text}&rdquo;</p>
                      <p className="hm-rwho">
                        <b>{shortName(r.patient_name)}</b>{r.treatment ? ` · ${r.treatment}` : ''}
                        {r.dentist.slug && <><br /><Link href={`/dentist/${r.dentist.slug}`}>{r.dentist.name}</Link></>}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="hm-sub">Reviews are just starting on {city.domain}.</p>
                <div className="hm-rempty">
                  <p className="hm-rtitle">Only patients who visited can review</p>
                  <ol className="hm-how">
                    <li><span className="hm-step-n">1</span>You book a dentist here and visit the clinic.</li>
                    <li><span className="hm-step-n">2</span>We send you a review link on WhatsApp after the visit.</li>
                    <li><span className="hm-step-n">3</span>Your rating shows on the dentist&apos;s profile. Dentists can&apos;t delete it.</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        </section>

        {/* AREAS + PRICES — side by side on desktop, stacked below */}
        <section className="hm-sec" style={{ background: 'var(--bg)' }}>
          <div className="container hm-two">
            <div>
              <h2 className="hm-h2">Pick your area</h2>
              <p className="hm-sub">Dentists listed in each area of {city.cityName}</p>
              {areaGroups.map(g => (
                <div key={g.zone ?? 'all'} style={{ marginBottom: g.zone ? 16 : 0 }}>
                  {g.zone && (
                    <span style={{
                      display: 'inline-block', marginBottom: 8, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: ZONE_COLORS[g.zone]?.bg, color: ZONE_COLORS[g.zone]?.text, border: `1px solid ${ZONE_COLORS[g.zone]?.border}`,
                    }}>{g.zone} Line</span>
                  )}
                  <div className="hm-areas">
                    {g.list.map(a => {
                      const n = areaCount(a.id)
                      return (
                        <Link key={a.id} href={`/area/${a.slug}`} className="hm-area">
                          {a.name}{n > 0 && <span className="hm-area-n">{n}</span>}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 16, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <Link href="/dentists" className="hm-more">All dentists in {city.cityName} →</Link>
                {/* PCMC umbrella cluster — Pune only (the /pcmc route 404s elsewhere). */}
                {city.citySlug === 'pune' && (
                  <Link href="/pcmc" className="hm-more">Pimpri-Chinchwad (PCMC) →</Link>
                )}
              </div>
            </div>

            <div>
              <h2 className="hm-h2">What it costs in {city.cityName}</h2>
              <p className="hm-sub">Starting fees set by dentists on {city.domain}</p>
              {priceRows.length > 0 && (
                <div className="hm-price">
                  {priceRows.map(({ t, fee }) => (
                    <Link key={t.id} href={`/treatment/${t.slug}`} className="hm-pr">
                      <span className="hm-pr-name">{t.name}</span>
                      <span className="hm-pr-fee">from ₹{fee.toLocaleString('en-IN')}<Chevron /></span>
                    </Link>
                  ))}
                </div>
              )}
              {otherTreatments.length > 0 && (
                <>
                  <p className="hm-more-label">{priceRows.length > 0 ? 'More treatments' : 'Treatments'}</p>
                  <div className="hm-tlinks">
                    {otherTreatments.map(t => (
                      <Link key={t.id} href={`/treatment/${t.slug}`} className="hm-tlink">{t.name}</Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* HOW WE CHECK: the registration detail lives on each profile */}
        <section className="hm-sec" style={{ background: '#fff' }}>
          <div className="container">
            <h2 className="hm-h2">How we check every dentist</h2>
            <p className="hm-sub">Done before a profile goes live. The registration number is on each dentist&apos;s profile.</p>
            <ul className="hm-trust">
              <li><ShieldIcon /><span><b>Registration number checked</b> with the State Dental Council.</span></li>
              <li><PinIcon /><span><b>Clinic and phone confirmed</b>, so you can visit or call.</span></li>
              <li><RupeeIcon /><span><b>Fees and timings shown</b> by the clinic before you book.</span></li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="hm-sec" style={{ background: 'var(--bg)' }}>
          <div className="container hm-faqrow">
            <div>
              <h2 className="hm-h2">Questions patients ask</h2>
              <p className="hm-sub">Still unsure? Call the clinic straight from its profile.</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <FaqAccordion items={FAQ_ITEMS} />
            </div>
          </div>
        </section>
      </main>

      <PopularSearches citySlug={city.citySlug} cityName={city.cityName} />
      <CitiesFooterLinks currentSlug={city.citySlug} />

      {/* FOOTER */}
      <footer style={{ background: '#0A1628', padding: '56px 20px 24px', color: 'rgba(255,255,255,0.7)' }}>
        <div className="container">
          <div className="home-footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, marginBottom: 48 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, background: 'var(--blue)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: 'var(--font-heading)' }}>D</div>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#fff', fontSize: 15 }}>{city.domain}</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 220 }}>
                {city.cityName}&apos;s most trusted platform for finding verified dentists by area and treatment.
              </p>
            </div>
            <div>
              <h4 style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Popular Treatments</h4>
              {[
                { label: 'Dental Implants', slug: 'dental-implants' },
                { label: 'Root Canal', slug: 'root-canal' },
                { label: 'Teeth Whitening', slug: 'teeth-whitening' },
                { label: 'Braces & Aligners', slug: 'braces-aligners' },
                { label: 'Smile Makeover', slug: 'smile-makeover' },
                { label: 'Teeth Cleaning', slug: 'teeth-cleaning' },
                { label: 'Tooth Extraction', slug: 'tooth-extraction' },
                { label: 'Dental Crowns', slug: 'dental-crowns' },
              ].map(t => (
                <div key={t.slug} style={{ marginBottom: 10 }}>
                  <Link href={`/treatment/${t.slug}`} style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', transition: 'color 0.2s' }}>{t.label}</Link>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top Areas</h4>
              {areasByCount.slice(0, 6).map(area => (
                <div key={area.id} style={{ marginBottom: 10 }}>
                  <Link href={`/area/${area.slug}`} style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Dentist in {area.name}</Link>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company</h4>
              {[
                { label: 'For Dentists', href: '/for-dentists' },
                { label: 'List Your Clinic', href: '/for-dentists/register' },
                { label: 'About Us', href: '/about' },
                { label: 'Expert Advice', href: '/articles' },
                { label: 'Blog', href: '/blog' },
                { label: 'Contact', href: '/contact' },
              ].map(link => (
                <div key={link.label} style={{ marginBottom: 10 }}>
                  <Link href={link.href} style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{link.label}</Link>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 13 }}>© {new Date().getFullYear()} {city.domain} · All rights reserved</p>
            <div style={{ display: 'flex', gap: 20 }}>
              <Link href="/privacy" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</Link>
              <Link href="/terms" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Terms of Use</Link>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        .hm-hero { background: linear-gradient(160deg, ${NAVY} 0%, #13253A 100%); padding: 44px 20px 40px; color: #fff; }
        .hm-h1 {
          font-family: var(--font-heading); font-weight: 800; color: #fff;
          font-size: clamp(1.85rem, 5.2vw, 3rem); line-height: 1.08; letter-spacing: -0.025em;
          max-width: 17ch; margin: 0; text-wrap: balance;
        }
        .hm-facts { list-style: none; padding: 0; margin: 14px 0 22px; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 14px; color: #CBD5E1; }
        .hm-facts li { display: inline-flex; align-items: center; gap: 6px; }
        .hm-need { margin: 22px 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #94A3B8; }
        .hm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .hm-chip {
          display: inline-flex; align-items: center; min-height: 40px; padding: 0 15px;
          border: 1px solid #334155; background: rgba(255,255,255,0.05); border-radius: 999px;
          color: #F1F5F9; font-weight: 600; font-size: 14px; text-decoration: none; white-space: nowrap;
          transition: border-color .15s, background .15s;
        }
        .hm-chip:hover { border-color: ${TEAL}; background: rgba(20,184,166,0.12); }

        .hm-sec { padding: 48px 20px; }
        .hm-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .hm-h2 { font-family: var(--font-heading); font-weight: 800; color: ${NAVY}; font-size: clamp(1.3rem, 2.8vw, 1.65rem); letter-spacing: -0.01em; margin: 0; }
        .hm-sub { font-size: 14px; color: #64748B; margin: 4px 0 18px; }
        .hm-more { color: ${TEAL_DARK}; font-weight: 700; font-size: 14px; text-decoration: none; }
        .hm-more:hover { text-decoration: underline; }

        .hm-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; padding-top: 6px; }
        .hm-card { min-width: 0; display: flex; }
        .hm-card:nth-child(n+5) { display: none; }

        .hm-two { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start; }
        .hm-areas { display: flex; flex-wrap: wrap; gap: 8px; }
        .hm-area {
          display: inline-flex; align-items: baseline; gap: 6px; padding: 9px 12px;
          background: #fff; border: 1px solid var(--border); border-radius: 10px;
          font-weight: 700; font-size: 14px; color: ${NAVY}; text-decoration: none;
          transition: border-color .15s;
        }
        .hm-area:hover { border-color: ${TEAL}; }
        .hm-area-n { font-weight: 500; font-size: 12.5px; color: #64748B; }
        .hm-price { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
        .hm-pr {
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
          padding: 14px 16px; border-top: 1px solid var(--border); text-decoration: none;
          transition: background .15s;
        }
        .hm-pr:first-child { border-top: 0; }
        .hm-pr:hover { background: #F8FAFC; }
        .hm-pr-name { font-weight: 700; color: ${NAVY}; font-size: 15px; }
        .hm-pr-fee { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: ${TEAL_DARK}; font-size: 15px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .hm-more-label { margin: 18px 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748B; }
        .hm-tlinks { display: flex; flex-wrap: wrap; gap: 6px 14px; }
        .hm-tlink { font-size: 14px; color: #334155; text-decoration: none; }
        .hm-tlink:hover { color: ${TEAL_DARK}; text-decoration: underline; }

        .hm-steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .hm-step { display: flex; gap: 14px; align-items: flex-start; background: #F8FAFC; border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
        .hm-step b { display: block; color: ${NAVY}; font-size: 15px; font-family: var(--font-heading); }
        .hm-step span span { display: block; font-size: 13.5px; color: #64748B; margin-top: 2px; line-height: 1.5; }
        .hm-step-n {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          background: #E6FAF7; color: ${TEAL_DARK}; font-weight: 800; font-size: 15px;
        }
        .hm-trust { list-style: none; padding: 0; margin: 24px 0 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .hm-trust li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; color: #334155; line-height: 1.5; }
        .hm-trust li svg { flex-shrink: 0; margin-top: 2px; }
        .hm-trust b { color: ${NAVY}; }

        .hm-faqrow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 32px; align-items: start; }
        .hm-rsum { display: flex; align-items: center; gap: 14px; margin: 14px 0 18px; }
        .hm-rbig { font-family: var(--font-heading); font-weight: 800; font-size: 32px; color: ${NAVY}; line-height: 1; }
        .hm-rnote { display: block; font-size: 13px; color: #64748B; margin-top: 2px; }
        .hm-rvs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .hm-rc { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
        .hm-rtext { margin: 0; font-size: 14px; color: #334155; line-height: 1.55; }
        .hm-rwho { margin: auto 0 0; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12.5px; color: #64748B; }
        .hm-rwho b { color: ${NAVY}; }
        .hm-rwho a { color: ${TEAL_DARK}; font-weight: 600; text-decoration: none; }
        .hm-rempty { border: 1.5px dashed #CBD5E1; border-radius: 16px; padding: 20px; background: #fff; max-width: 640px; }
        .hm-rtitle { margin: 0 0 12px; font-family: var(--font-heading); font-weight: 700; color: ${NAVY}; font-size: 16px; }
        .hm-how { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
        .hm-how li { display: flex; gap: 10px; align-items: center; font-size: 14px; color: #334155; }
        .hm-how .hm-step-n { width: 26px; height: 26px; font-size: 13px; }
        .hm-dcta { background: ${NAVY}; border-radius: 18px; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
        .hm-dcta-btn {
          display: inline-flex; align-items: center; justify-content: center; align-self: flex-start;
          padding: 12px 20px; background: ${TEAL}; color: #fff; border-radius: 12px;
          font-family: var(--font-body); font-weight: 700; font-size: 15px; text-decoration: none; white-space: nowrap;
        }
        .hm-dcta-btn:hover { background: ${TEAL_DARK}; }

        /* Tablet */
        @media (max-width: 1024px) {
          .hm-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .hm-two { grid-template-columns: 1fr; gap: 36px; }
          .hm-trust { grid-template-columns: 1fr; gap: 12px; }
          .hm-faqrow { grid-template-columns: 1fr; gap: 8px; }
          .hm-rvs { grid-template-columns: 1fr; }
          .hm-dcta { flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; }
          .hm-dcta-btn { align-self: auto; }
        }
        /* Phone: dentist cards become a swipe row showing all 8 */
        @media (max-width: 640px) {
          .hm-hero { padding: 28px 16px 28px; }
          .hm-facts { font-size: 13px; margin: 12px 0 18px; }
          .hm-need { margin-top: 18px; }
          .hm-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-right: -16px; padding-right: 16px; }
          .hm-chips::-webkit-scrollbar { display: none; }
          .hm-sec { padding: 32px 16px; }
          .hm-cards {
            display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none;
            margin-right: -16px; padding-right: 16px; gap: 12px;
          }
          .hm-cards::-webkit-scrollbar { display: none; }
          .hm-card, .hm-card:nth-child(n+5) { display: flex; flex: 0 0 min(318px, 88%); scroll-snap-align: start; }
          .hm-card .drc-cta { white-space: nowrap; padding: 0 10px; }
          .hm-steps { grid-template-columns: 1fr; gap: 10px; }
          .hm-step { padding: 14px; }
          .hm-pr { padding: 13px 14px; }
          .hm-pr-name, .hm-pr-fee { font-size: 14.5px; }
          .home-footer-grid { gap: 28px !important; }
        }
      `}</style>
    </>
  )
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} aria-label={`${n} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map(i => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i < n ? '#F59E0B' : '#E2E8F0'} aria-hidden="true">
          <path d="m12 2 3 6.6 7 .7-5.3 4.8 1.6 7L12 17.5 5.7 21l1.6-7L2 9.3l7-.7L12 2Z" />
        </svg>
      ))}
    </span>
  )
}

// "Neha Sharma" → "Neha S." so patients aren't shown with full names.
function shortName(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Patient'
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

function RupeeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 5h10M7 9h10M13 19 7.5 13H10a4 4 0 0 0 0-8" />
    </svg>
  )
}
