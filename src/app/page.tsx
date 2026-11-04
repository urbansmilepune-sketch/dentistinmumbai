import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityHomeData, getCityHomeStats, getHomeSpotlightDentists } from '@/lib/cache/public-pages'
import SiteHeader from '@/components/SiteHeader'
import HomeHeroSearch from '@/components/HomeHeroSearch'
import DentistResultCard from '@/components/DentistResultCard'
import FaqAccordion from '@/components/FaqAccordion'
import { CITY_CONFIGS, NATIONAL_ORIGIN, cityOrigin, getCityBySlug, cityBrandName, isNationalHost } from '@/config/cities'
import NationalHome from '@/components/national/NationalHome'
import CitiesFooterLinks from '@/components/CitiesFooterLinks'
import PopularSearches from '@/components/PopularSearches'
import DentistMobileStickyBar from '@/components/DentistMobileStickyBar'
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

function faqItemsFor(cityName: string, domain: string) {
  return [
    {
      q: `How do I find a good dentist in ${cityName}?`,
      a: `Start with what you need — tap "Tooth pain" or "Braces", use Near me, or browse by your area. Every dentist's State Dental Council registration is checked before their profile goes live, and fees and timings are shown on each profile so you can compare before you book.`,
    },
    {
      q: `How much does a dental checkup cost in ${cityName}?`,
      a: `A routine dental consultation in ${cityName} typically costs ₹200–₹500, and many clinics offer a free first consultation for new patients. Treatment fees (cleaning, fillings, root canal) vary by clinic — check each dentist's profile for their listed fees.`,
    },
    {
      q: 'Are the dentists on this platform verified?',
      a: 'Yes. Every dentist listed is verified with their State Dental Council registration number, clinic address, and contact details before going live on our platform.',
    },
    {
      q: 'Is it free to book an appointment through your platform?',
      a: 'Completely free for patients. We never charge for bookings, enquiries, or WhatsApp connects. You pay only the dentist for the treatment.',
    },
    {
      q: `What is the average cost of dental implants in ${cityName}?`,
      a: `Dental implants in ${cityName} typically range from ₹25,000 to ₹80,000 per implant depending on the brand, clinic, and area. Use our cost guide on any area page to compare.`,
    },
    {
      q: `How do I list my dental clinic on ${domain}?`,
      a: `We're currently onboarding founding member dentists — the first 1000 listings are completely free, forever. Visit our "For Dentists" page to register your clinic in under 5 minutes.`,
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
  const FAQ_ITEMS = faqItemsFor(city.cityName, city.domain)

  // Heavy Supabase reads live behind unstable_cache (5-min TTL). getCityHomeData
  // carries the area/treatment menus + the honest dentist count; getCityHomeStats
  // carries the live per-treatment fees and per-area dentist counts the
  // denormalized columns don't reliably hold. See src/lib/cache/public-pages.ts.
  const [{ areas, treatments, dentistCount }, stats, spotlightPool] = await Promise.all([
    getCityHomeData(city.citySlug),
    getCityHomeStats(city.citySlug),
    getHomeSpotlightDentists(city.citySlug),
  ])

  const isMumbai = city.citySlug === 'mumbai'
  const areaCount = (id: number | string) => stats.areaDentistCount[String(id)] ?? 0
  const findTreatment = (match: string) => treatments.find(t => t.name.toLowerCase().includes(match))

  // Order areas by their LIVE dentist count so populated areas surface first
  // (areas.dentist_count is unmaintained, so the cached order can't be trusted).
  const areasByCount = [...areas].sort((a, b) => areaCount(b.id) - areaCount(a.id))

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

  // "Open now" row: dentists with a photo + fee, open right now (IST), rotated
  // hourly so the same few don't always lead. If fewer than 4 are open (early
  // morning, late night, Sundays) the row tops up with the next-best closed
  // ones and the heading changes so it never claims "open" falsely.
  const hourSalt = new Date().toISOString().slice(0, 13)
  const withStatus = spotlightPool.map(d => ({ d, open: getOpenStatus(d.working_hours).state === 'open' }))
  const openNow = withStatus.filter(x => x.open).sort((a, b) => rotationKey(a.d.id, hourSalt) - rotationKey(b.d.id, hourSalt))
  const closed = withStatus.filter(x => !x.open)
  const spotlight = [...openNow, ...closed].slice(0, 8).map(x => x.d)
  const spotlightIsOpen = openNow.length >= 4
  const spotlightTitle = spotlightIsOpen ? `Open now in ${city.cityName}` : `Dentists you can book in ${city.cityName}`

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
      <SiteHeader city={city} hideSearch />

      <main style={{ overflowX: 'hidden' }}>
        {/* HERO — headline, honest facts, search + Near me, need chips */}
        <section className="hm-hero">
          <div className="container">
            <h1 className="hm-h1">
              Find a dentist in {city.cityName} you can <span style={{ color: TEAL }}>book today</span>
            </h1>
            <ul className="hm-facts">
              {dentistCount > 0 && <li><Tick />{dentistCount} dentists</li>}
              <li><Tick />Registration checked</li>
              <li><Tick />Free to book, pay at the clinic</li>
            </ul>
            <HomeHeroSearch placeholder={`Tooth pain, root canal, ${areasByCount[0]?.name ?? 'your area'}…`} />
            {needChips.length > 0 && (
              <>
                <p className="hm-need">What do you need?</p>
                <div className="hm-chips">
                  {needChips.map(c => (
                    <Link key={c.label} href={`/dentists?treatment=${c.t.slug}`} className="hm-chip">{c.label}</Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* OPEN NOW — real dentist cards, two CTAs each (DentistResultCard) */}
        {spotlight.length > 0 && (
          <section className="hm-sec" style={{ background: '#fff' }}>
            <div className="container">
              <div className="hm-head">
                <h2 className="hm-h2">{spotlightTitle}</h2>
                <Link href="/dentists" className="hm-more">See all dentists →</Link>
              </div>
              <p className="hm-sub">
                {spotlightIsOpen
                  ? 'Clinics open right now, with photo, fee and timings on their profile.'
                  : 'Clinics with photo, fee and timings on their profile. Book now for their next opening.'}
              </p>
              <div className="hm-cards">
                {spotlight.map(d => (
                  <div key={d.id} className="hm-card">
                    <DentistResultCard dentist={{ ...d, is_verified: !!d.is_verified }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

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

        {/* HOW BOOKING WORKS + what we can honestly promise */}
        <section className="hm-sec" style={{ background: '#fff' }}>
          <div className="container">
            <h2 className="hm-h2" style={{ marginBottom: 18 }}>How booking works</h2>
            <ol className="hm-steps">
              {[
                { t: 'Pick a dentist', d: 'Compare fee, timings and distance.' },
                { t: 'Choose a time', d: 'Takes about 2 minutes. No payment to book.' },
                { t: 'Visit the clinic', d: 'Pay the dentist directly for your treatment.' },
              ].map((s, i) => (
                <li key={s.t} className="hm-step">
                  <span className="hm-step-n">{i + 1}</span>
                  <span><b>{s.t}</b><span>{s.d}</span></span>
                </li>
              ))}
            </ol>
            <ul className="hm-trust">
              <li><ShieldIcon /><span><b>Registration checked</b> with the State Dental Council before a profile goes live.</span></li>
              <li><RupeeIcon /><span><b>Fees shown upfront</b> on every profile, so there are no surprises.</span></li>
              <li><Tick color={TEAL_DARK} size={16} /><span><b>Free for patients.</b> No charge to search, enquire or book.</span></li>
            </ul>
          </div>
        </section>

        {/* FAQ + FOR DENTISTS */}
        <section className="hm-sec" style={{ background: 'var(--bg)' }}>
          <div className="container hm-faqrow">
            <div style={{ minWidth: 0 }}>
              <h2 className="hm-h2" style={{ marginBottom: 16 }}>Questions patients ask</h2>
              <FaqAccordion items={FAQ_ITEMS} />
            </div>
            <div className="hm-dcta">
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, color: '#fff', marginBottom: 6 }}>
                  Run a dental clinic in {city.cityName}?
                </h2>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                  List it free and start getting patients. Takes 2 minutes.
                </p>
              </div>
              <Link href="/for-dentists/register" className="hm-dcta-btn">List your clinic free →</Link>
            </div>
          </div>
        </section>
      </main>

      <PopularSearches citySlug={city.citySlug} cityName={city.cityName} />
      <CitiesFooterLinks currentSlug={city.citySlug} />
      <DentistMobileStickyBar />

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

        .hm-faqrow { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 32px; align-items: start; }
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
          .hm-faqrow { grid-template-columns: 1fr; }
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
          footer { padding-bottom: 88px !important; }
        }
      `}</style>
    </>
  )
}

function Tick({ color = '#14B8A6', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
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

function RupeeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 5h10M7 9h10M13 19 7.5 13H10a4 4 0 0 0 0-8" />
    </svg>
  )
}
