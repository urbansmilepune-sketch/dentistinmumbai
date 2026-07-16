import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getCityHomeData, getCityHomeStats } from '@/lib/cache/public-pages'
import SiteHeader from '@/components/SiteHeader'
import HomeNearMe from '@/components/HomeNearMe'
import FaqAccordion from '@/components/FaqAccordion'
import { CITY_CONFIGS, NATIONAL_ORIGIN, cityOrigin, getCityBySlug, cityBrandName, isNationalHost } from '@/config/cities'
import NationalHome from '@/components/national/NationalHome'
import CitiesFooterLinks from '@/components/CitiesFooterLinks'
import PopularSearches from '@/components/PopularSearches'
import DentistMobileStickyBar from '@/components/DentistMobileStickyBar'
import { NAVY, NAVY_SOFT, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'
import { dentistCountLabel } from '@/lib/dentistCount'

// Per-host metadata. dentistinindia.in gets network-framed copy; every
// city domain gets a "Dentist in <City>" search title tuned for the
// "dentist in <city>" intent. proxy.ts has already tagged the request
// with x-is-national / x-city-slug by the time this runs.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  if (h.get('x-is-national') === '1' || isNationalHost(h.get('x-forwarded-host') || h.get('host'))) {
    const liveCityCount = Object.keys(CITY_CONFIGS).length
    return {
      title: `DentistIn India | India's Dental Professional Network | ${liveCityCount} Cities`,
      description: "India's largest dental professional network. Find verified dentists across India, book appointments, share clinical cases, and connect with dental professionals.",
      alternates: { canonical: NATIONAL_ORIGIN },
      openGraph: {
        title: "DentistIn India | India's Dental Professional Network",
        description: 'Find verified dentists across India. Book appointments. Share clinical cases. Connect with peers.',
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
    description: `Find and book the best dentists in ${city.cityName}. Verified clinics, online appointments, patient reviews. Book your dental appointment online today — free consultation booking.`,
    keywords: `dentist in ${city.cityName}, dental clinic ${city.cityName}, best dentist ${city.cityName}, dental implants ${city.cityName}, root canal ${city.cityName}, teeth whitening ${city.cityName}, orthodontist ${city.cityName}`,
    alternates: { canonical: `${origin}/` },
    openGraph: {
      title: `Dentist in ${city.cityName} | ${brand}`,
      description: `Book verified dentists in ${city.cityName} online. Read reviews, check fees, book instantly.`,
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
      a: `Start with what you need — tap an intent like "Tooth pain" or "Braces", or browse by your area. Every dentist on our platform is verified with their State Dental Council registration, with real patient reviews and transparent fees so you can compare before you book.`,
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

// Patient-intent tiles for the hero. Labels are how patients describe their
// need ("Tooth pain"), each mapped to a real treatment slug (confirmed to
// exist in the treatments table). The fallback emoji is used only if the
// treatment row has no icon; normally we render the treatment's own icon.
const INTENT_TILES: { label: string; slug: string; emoji: string }[] = [
  { label: 'Tooth pain', slug: 'root-canal', emoji: '😣' },
  { label: 'Teeth cleaning', slug: 'teeth-cleaning', emoji: '✨' },
  { label: 'Tooth extraction', slug: 'tooth-extraction', emoji: '🦷' },
  { label: 'Dental crowns', slug: 'dental-crowns', emoji: '👑' },
  { label: 'Teeth whitening', slug: 'teeth-whitening', emoji: '😁' },
  { label: 'Fillings', slug: 'tooth-fillings', emoji: '🪥' },
]

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
  // carries the live per-treatment and per-area dentist counts the denormalized
  // columns don't reliably hold. See src/lib/cache/public-pages.ts.
  const [{ areas, treatments, dentistCount }, stats] = await Promise.all([
    getCityHomeData(city.citySlug),
    getCityHomeStats(city.citySlug),
  ])

  const isMumbai = city.citySlug === 'mumbai'
  const areaCount = (id: number | string) => stats.areaDentistCount[String(id)] ?? 0
  const treatmentById = new Map(treatments.map(t => [t.slug, t]))

  // Order areas by their LIVE dentist count so populated areas surface first
  // (areas.dentist_count is unmaintained, so the cached order can't be trusted).
  const areasByCount = [...areas].sort((a, b) => areaCount(b.id) - areaCount(a.id))

  // Mumbai groups areas by suburban-rail line; every other city renders a flat
  // grid (their `zone` column doesn't carry the Western/Central/Harbour split).
  const westernAreas = isMumbai ? areasByCount.filter(a => a.zone === 'Western').slice(0, 6) : []
  const centralAreas = isMumbai ? areasByCount.filter(a => a.zone === 'Central').slice(0, 6) : []
  const southAreas   = isMumbai ? areasByCount.filter(a => a.zone === 'South').slice(0, 4)   : []
  const naviAreas    = isMumbai ? areasByCount.filter(a => a.zone === 'Navi Mumbai').slice(0, 4) : []
  const flatAreas    = isMumbai ? [] : areasByCount.slice(0, 16)

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

      {/* NAV — shared across all public pages (carries the search bar) */}
      <SiteHeader city={city} />

      <main style={{ overflowX: 'hidden' }}>
        {/* HERO — navy intent router */}
        <section style={{ background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`, padding: '56px 20px 64px' }}>
          <div className="container" style={{ maxWidth: 820, textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.9rem, 5vw, 3rem)', color: '#fff', lineHeight: 1.15, marginBottom: 14 }}>
              Find the Right Dentist in {city.cityName}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 32px' }}>
              {dentistCount} verified dentist{dentistCount === 1 ? '' : 's'} across {city.cityName}. Real reviews, transparent fees, book in 2 minutes.
            </p>

            {/* INTENT TILES — the core of the hero. Real <Link>s for SEO. */}
            <div className="intent-grid">
              {INTENT_TILES.map(tile => {
                const t = treatmentById.get(tile.slug)
                const count = t ? (stats.treatmentDentistCount[String(t.id)] ?? 0) : 0
                const icon = t?.icon || tile.emoji
                return (
                  // Intent tiles link to filtered dentist list, not treatment editorial
                  // pages — patients want dentists, not content
                  <Link key={tile.slug} href={`/dentists?treatment=${tile.slug}`} className="intent-tile">
                    <span className="intent-icon" aria-hidden="true">{icon}</span>
                    <span className="intent-label">{tile.label}</span>
                    <span className="intent-count">{dentistCountLabel(count)}</span>
                  </Link>
                )
              })}
            </div>

            <HomeNearMe />
          </div>
        </section>

        {/* BROWSE BY AREA */}
        <section style={{ background: '#fff', padding: '56px 20px' }}>
          <div className="container">
            <div style={{ marginBottom: 28 }}>
              <p style={{ color: TEAL_DARK, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Browse by location</p>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, color: NAVY }}>Browse dentists by area in {city.cityName}</h2>
            </div>

            {isMumbai ? (
              [
                { zone: 'Western', areas: westernAreas },
                { zone: 'Central', areas: centralAreas },
                { zone: 'South', areas: southAreas },
                { zone: 'Navi Mumbai', areas: naviAreas },
              ].map(({ zone, areas: zoneAreas }) => zoneAreas.length > 0 && (
                <div key={zone} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{
                      padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: ZONE_COLORS[zone]?.bg, color: ZONE_COLORS[zone]?.text,
                      border: `1px solid ${ZONE_COLORS[zone]?.border}`,
                    }}>{zone} Line</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                  <div className="home-area-grid">
                    {zoneAreas.map(a => <AreaCard key={a.id} slug={a.slug} name={a.name} count={areaCount(a.id)} />)}
                  </div>
                </div>
              ))
            ) : (
              <div className="home-area-grid">
                {flatAreas.map(a => <AreaCard key={a.id} slug={a.slug} name={a.name} count={areaCount(a.id)} />)}
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <Link href="/dentists" style={{ color: TEAL_DARK, fontWeight: 700, fontSize: 14 }}>View all dentists →</Link>
              {/* PCMC umbrella cluster — Pune only (the /pcmc route 404s elsewhere). */}
              {city.citySlug === 'pune' && (
                <Link href="/pcmc" style={{ color: TEAL_DARK, fontWeight: 700, fontSize: 14 }}>Dentists in Pimpri-Chinchwad (PCMC) →</Link>
              )}
            </div>
          </div>
        </section>

        {/* BROWSE BY TREATMENT */}
        <section style={{ background: 'var(--bg)', padding: '56px 20px' }}>
          <div className="container">
            <div style={{ marginBottom: 28 }}>
              <p style={{ color: TEAL_DARK, fontWeight: 700, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Browse by treatment</p>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, color: NAVY }}>Browse by treatment</h2>
            </div>
            <div className="home-treatment-grid">
              {treatments.map(t => {
                const minFee = stats.treatmentMinFee[String(t.id)]
                return (
                  <Link key={t.id} href={`/treatment/${t.slug}`} className="treatment-tile">
                    <span style={{ fontSize: 28 }} aria-hidden="true">{t.icon || '🦷'}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', color: NAVY, lineHeight: 1.3 }}>{t.name}</span>
                    {typeof minFee === 'number' && minFee > 0 && (
                      <span style={{ fontSize: 12.5, color: TEAL_DARK, fontWeight: 600 }}>from ₹{minFee.toLocaleString('en-IN')}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* WHY DENTISTIN — brief + honest */}
        <section style={{ background: '#fff', padding: '56px 20px' }}>
          <div className="container">
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, color: NAVY, marginBottom: 28 }}>
              Why {city.domain}
            </h2>
            <div className="home-why-grid">
              {[
                { icon: '🛡️', title: 'Verified dentists', desc: 'Every clinic is checked against its State Dental Council registration before going live.' },
                { icon: '⭐', title: 'Real reviews', desc: 'Only genuine patient reviews — screened, never bought.' },
                { icon: '💰', title: 'Transparent fees', desc: 'See consultation fees upfront. No surprises at the clinic.' },
                { icon: '🆓', title: 'Free to use', desc: 'No charge to search, enquire, or book. You only pay the dentist.' },
              ].map(item => (
                <div key={item.title} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px' }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }} aria-hidden="true">{item.icon}</div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15.5, color: NAVY, marginBottom: 6 }}>{item.title}</h3>
                  <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ background: 'var(--bg)', padding: '56px 20px' }}>
          <div className="container" style={{ maxWidth: 720 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 800, color: NAVY, marginBottom: 24, textAlign: 'center' }}>
              Frequently Asked Questions
            </h2>
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </section>

        {/* FOR DENTISTS — small, bottom */}
        <section style={{ background: '#fff', padding: '24px 20px 56px' }}>
          <div className="container">
            <div className="home-dentist-cta" style={{ background: NAVY, borderRadius: 20, padding: '32px 28px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.2rem, 2.6vw, 1.6rem)', color: '#fff', marginBottom: 6 }}>
                  Are you a dentist in {city.cityName}?
                </h2>
                <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                  List your clinic free and start receiving patients. Takes 2 minutes.
                </p>
              </div>
              <Link href="/for-dentists/register" style={{
                display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
                padding: '13px 26px', background: TEAL, color: '#fff', borderRadius: 12,
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, textDecoration: 'none',
              }}>List your clinic free →</Link>
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
        .intent-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
          max-width: 640px; margin: 0 auto;
        }
        .intent-tile {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 18px 12px; min-height: 110px; justify-content: center;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 16px; text-decoration: none; transition: background .15s, border-color .15s, transform .15s;
        }
        .intent-tile:hover { background: rgba(255,255,255,0.14); border-color: ${TEAL}; transform: translateY(-2px); }
        .intent-icon { font-size: 28px; line-height: 1; }
        .intent-label { font-family: var(--font-heading); font-weight: 700; font-size: 14.5px; color: #fff; text-align: center; }
        .intent-count { font-size: 12px; color: ${TEAL}; font-weight: 600; }
        .home-area-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        .home-treatment-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
        .treatment-tile {
          display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
          padding: 22px 16px; background: #fff; border: 1px solid var(--border); border-radius: 14px;
          text-decoration: none; transition: border-color .15s, transform .15s, box-shadow .15s;
        }
        .treatment-tile:hover { border-color: ${TEAL}; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(15,23,42,0.06); }
        .home-why-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .home-dentist-cta { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
        @media (max-width: 768px) {
          .intent-grid { grid-template-columns: repeat(2, 1fr); }
          .home-area-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px; }
          .home-treatment-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .home-why-grid { grid-template-columns: repeat(2, 1fr); }
          .home-footer-grid { gap: 28px !important; }
          footer { padding-bottom: 88px !important; }
        }
        @media (max-width: 380px) {
          .home-why-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  )
}

// Area link card — name + live dentist count (or a neutral hint at 0, since
// areas.dentist_count is unmaintained and we never show a fake number).
function AreaCard({ slug, name, count }: { slug: string; name: string; count: number }) {
  return (
    <Link href={`/area/${slug}`} className="area-card" style={{
      display: 'block', padding: '16px 18px', background: 'var(--bg)',
      border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none',
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-heading)', color: NAVY, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{dentistCountLabel(count)}</div>
    </Link>
  )
}
