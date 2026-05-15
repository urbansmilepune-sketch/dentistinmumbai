import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import SearchBar from '@/components/SearchBar'
import FaqAccordion from '@/components/FaqAccordion'
import { getCityBySlug, cityBrandName, cityBrandTld } from '@/config/cities'

function faqItemsFor(cityName: string, domain: string) {
  return [
    {
      q: `How do I find the best dentist near me in ${cityName}?`,
      a: `Use our search to filter by your area and the treatment you need. Every dentist on our platform is verified, with real patient reviews and transparent fees.`,
    },
    {
      q: 'Are the dentists on this platform verified?',
      a: 'Yes. Every dentist listed is verified with their MCI registration number, clinic address, and contact details before going live on our platform.',
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
      q: 'Can I book an emergency dental appointment?',
      a: 'Yes. Filter by "Emergency Dental" in our search to find dentists who offer same-day or emergency slots. Many clinics on our platform have WhatsApp direct connect for urgent cases.',
    },
    {
      q: `How do I list my dental clinic on ${domain}?`,
      a: `We're currently onboarding founding member dentists — the first 250 listings are completely free, forever. Visit our "For Dentists" page to register your clinic in under 5 minutes.`,
    },
  ]
}

const ZONE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Western: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  Central: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  South: { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
  'Navi Mumbai': { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
}

export default async function HomePage() {
  const supabase = await createClient()
  const h = await headers()
  const city = getCityBySlug(h.get('x-city-slug'))
  const brandName = cityBrandName(city)
  const brandTld = cityBrandTld(city)
  const FAQ_ITEMS = faqItemsFor(city.cityName, city.domain)

  // Early-stage UX: until we cross PREMIUM_FLOOR active gold/featured
  // listings, the homepage shows every active dentist so new approvals
  // surface immediately (rather than waiting on an admin to flip
  // Verified + raise tier). Once we cross the floor the section
  // auto-switches back to the curated featured/gold/silver+verified view.
  // Both dentist queries are fired in parallel and we pick afterwards —
  // costs ~6 extra rows on the wire but saves a round-trip.
  const PREMIUM_FLOOR = 50
  const DENTIST_SELECT = 'id, name, slug, clinic_name, area_id, consultation_fee, experience_years, tier, is_verified, profile_photo, areas(name)'

  const [
    { data: areas },
    { data: treatments },
    { count: premiumCount },
    { count: dentistCount },
    { data: allActiveDentists },
    { data: curatedDentists },
  ] = await Promise.all([
    supabase.from('areas').select('id, name, slug, zone, dentist_count').eq('city', city.citySlug).order('dentist_count', { ascending: false }),
    supabase.from('treatments').select('id, name, slug, icon').order('sort_order'),
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('city', city.citySlug).in('tier', ['gold', 'featured']),
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('city', city.citySlug),
    supabase
      .from('dentists')
      .select(DENTIST_SELECT)
      .eq('is_active', true)
      .eq('city', city.citySlug)
      .order('tier')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('dentists')
      .select(DENTIST_SELECT)
      .eq('is_active', true)
      .eq('is_verified', true)
      .eq('city', city.citySlug)
      .in('tier', ['featured', 'gold', 'silver'])
      .order('tier')
      .limit(6),
  ])

  const showAllDentists = (premiumCount ?? 0) < PREMIUM_FLOOR
  const featuredDentists = showAllDentists ? allActiveDentists : curatedDentists

  const areaList = areas ?? []
  const treatmentList = treatments ?? []
  const dentists = featuredDentists ?? []
  const totalDentists = dentistCount ?? 0

  const westernAreas = areaList.filter(a => a.zone === 'Western').slice(0, 5)
  const centralAreas = areaList.filter(a => a.zone === 'Central').slice(0, 5)
  const southAreas = areaList.filter(a => a.zone === 'South').slice(0, 3)
  const naviAreas = areaList.filter(a => a.zone === 'Navi Mumbai').slice(0, 3)
  const topTreatments = treatmentList.slice(0, 12)

  return (
    <>
      {/* NAV */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(8px)' }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt={city.domain} style={{ height: 40, width: 'auto', display: 'block' }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href="/dentists" className="nav-secondary-link" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>Find Dentists</Link>
            <Link href="/for-dentists" className="nav-secondary-link" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>For Dentists</Link>
            <Link href="/for-dentists/register" className="btn btn-primary btn-sm">List Your Clinic</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* HERO */}
        <section className="home-hero" style={{
          background: 'linear-gradient(135deg, #003F7A 0%, #0057A8 50%, #1A6FC4 100%)',
          padding: '80px 20px 100px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div aria-hidden="true" style={{
            position: 'absolute', top: -80, right: -80, width: 400, height: 400,
            background: 'rgba(255,255,255,0.04)', borderRadius: '50%',
          }} />
          <div aria-hidden="true" style={{
            position: 'absolute', bottom: -60, left: '10%', width: 250, height: 250,
            background: 'rgba(255,255,255,0.03)', borderRadius: '50%',
          }} />

          <div className="container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div className="badge badge-blue" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', marginBottom: 20 }}>
              🏆 {city.cityName}&apos;s Most Trusted Dental Directory
            </div>
            <h1 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(2rem, 5vw, 3.25rem)',
              fontWeight: 800,
              color: '#fff',
              maxWidth: 760,
              marginBottom: 20,
              lineHeight: 1.15,
            }}>
              {city.heroTitle} — <span style={{ color: '#7DD3FC' }}>Near You</span>
            </h1>
            <p className="home-hero-sub" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, maxWidth: 520, marginBottom: 40, lineHeight: 1.7 }}>
              {city.heroSubtitle}. Real reviews, transparent fees, instant booking.
            </p>

            <SearchBar areas={areaList.map(a => ({ name: a.name, slug: a.slug }))} treatments={treatmentList.map(t => ({ name: t.name, slug: t.slug }))} cityName={city.cityName} />

            {/* Quick area chips — top 6 areas by dentist_count (areaList is already city-filtered). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 28, justifyContent: 'center' }}>
              {areaList.slice(0, 6).map(a => (
                <Link key={a.slug} href={`/area/${a.slug}`} style={{
                  padding: '7px 16px',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 20,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'background 0.2s',
                }}>
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* STATS BAR */}
        <section className="home-stats" style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '28px 20px' }}>
          <div className="container">
            <div className="home-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 24, textAlign: 'center' }}>
              {[
                { value: `${totalDentists || '200'}+`, label: 'Verified Dentists' },
                { value: `${areaList.length || 24}+`, label: `${city.cityName} Areas` },
                { value: '15+', label: 'Treatments' },
                { value: '4.8★', label: 'Average Rating' },
              ].map(stat => (
                <div key={stat.label}>
                  <div className="home-stat-value" style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 800, color: 'var(--blue)' }}>{stat.value}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500, marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURED DENTISTS */}
        {dentists.length > 0 && (
          <section className="home-section" style={{ padding: '72px 20px', background: 'var(--bg)' }}>
            <div className="container">
              <div className="home-section-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40, gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{showAllDentists ? 'Browse' : 'Top Rated'}</p>
                  <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800 }}>{showAllDentists ? `Dentists on ${city.domain}` : `Featured Dentists in ${city.cityName}`}</h2>
                </div>
                <Link href="/dentists" style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}>View all →</Link>
              </div>
              <div className="home-featured-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                {dentists.map(d => (
                  <Link key={d.id} href={`/dentist/${d.slug}`} style={{ textDecoration: 'none' }}>
                    <article className="card-hover" style={{
                      background: '#fff',
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}>
                      <div style={{ padding: '20px 20px 16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 64, height: 64, borderRadius: 12,
                          background: 'var(--blue-light)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 24, flexShrink: 0,
                          border: '2px solid var(--border)',
                        }}>
                          {d.profile_photo ? (
                            <img src={d.profile_photo} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                          ) : '🦷'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{d.name}</h3>
                            {d.is_verified && <span className="verified-icon" title="Verified">✓</span>}
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                            {d.clinic_name} · {(d as any).areas?.name || city.cityName}
                          </p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {d.tier === 'featured' && <span className="badge badge-featured">⭐ Featured</span>}
                            {d.tier === 'gold' && <span className="badge badge-gold">Gold</span>}
                            {d.experience_years > 0 && (
                              <span className="badge badge-blue">{d.experience_years} yrs exp</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Consultation from</span>
                          <span style={{ marginLeft: 6, fontWeight: 700, color: 'var(--text)', fontSize: 16 }}>
                            {d.consultation_fee ? `₹${d.consultation_fee}` : 'Call for price'}
                          </span>
                        </div>
                        <span style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 600 }}>View Profile →</span>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* AREAS GRID */}
        <section className="home-section" style={{ padding: '72px 20px', background: '#fff' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Browse by Location</p>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, marginBottom: 12 }}>Find Dentists in Your Area</h2>
              <p style={{ color: 'var(--muted)', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>
                Covering all major {city.cityName} areas.
              </p>
            </div>

            {/* Zone groups */}
            {[
              { zone: 'Western', areas: westernAreas },
              { zone: 'Central', areas: centralAreas },
              { zone: 'South', areas: southAreas },
              { zone: 'Navi Mumbai', areas: naviAreas },
            ].map(({ zone, areas: zoneAreas }) => zoneAreas.length > 0 && (
              <div key={zone} style={{ marginBottom: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span style={{
                    padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: ZONE_COLORS[zone]?.bg, color: ZONE_COLORS[zone]?.text,
                    border: `1px solid ${ZONE_COLORS[zone]?.border}`,
                  }}>{zone} Line</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                  {zoneAreas.map(area => (
                    <Link key={area.id} href={`/area/${area.slug}`}>
                      <div className="area-card" style={{
                        padding: '16px 20px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        cursor: 'pointer',
                        transition: 'border-color 0.2s, background 0.2s',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 15, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>{area.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {area.dentist_count > 0 ? `${area.dentist_count} dentists` : 'View dentists'}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link href="/dentists" className="btn btn-outline">View All Areas →</Link>
            </div>
          </div>
        </section>

        {/* TREATMENTS GRID */}
        <section className="home-section" style={{ padding: '72px 20px', background: 'var(--bg)' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Browse by Treatment</p>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, marginBottom: 12 }}>Every Dental Treatment Covered</h2>
              <p style={{ color: 'var(--muted)', fontSize: 16, maxWidth: 460, margin: '0 auto' }}>
                From routine cleanings to full smile makeovers — find specialists for any treatment.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
              {topTreatments.map(t => (
                <Link key={t.id} href={`/treatment/${t.slug}`}>
                  <div className="treatment-card" style={{
                    padding: '24px 20px',
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>{t.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-heading)', color: 'var(--text)', lineHeight: 1.3 }}>{t.name}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* WHY US — DARK SECTION */}
        <section className="home-section" style={{ padding: '80px 20px', background: 'var(--text)' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <p style={{ color: '#7DD3FC', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Why {city.domain}</p>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 800, color: '#fff', maxWidth: 560, margin: '0 auto' }}>
                The smarter way to find your dentist in {city.cityName}
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 32 }}>
              {[
                { icon: '✅', title: 'Verified Dentists Only', desc: 'Every listing is manually verified with MCI registration and clinic visit before going live.' },
                { icon: '💰', title: 'Transparent Fees', desc: 'See consultation fees and treatment price ranges upfront — no surprises, no hidden charges.' },
                { icon: '⭐', title: 'Real Patient Reviews', desc: 'Only verified patient reviews. Our moderation team screens every submission.' },
                { icon: '📅', title: 'Instant Booking', desc: 'Book appointments directly through the platform or connect via WhatsApp in one tap.' },
              ].map(item => (
                <div key={item.title} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}>{item.icon}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)', marginBottom: 10 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOR DENTISTS TEASER */}
        <section className="home-section" style={{ padding: '72px 20px', background: '#fff' }}>
          <div className="container">
            <div className="home-cta-card" style={{
              background: 'linear-gradient(135deg, var(--blue-light) 0%, #EFF6FF 100%)',
              border: '1px solid #BFDBFE',
              borderRadius: 24,
              padding: '56px 48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 40,
              flexWrap: 'wrap',
            }}>
              <div style={{ maxWidth: 520 }}>
                <div className="badge badge-blue" style={{ marginBottom: 16 }}>
                  🏆 Founding Member Offer — Limited Spots
                </div>
                <h2 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, marginBottom: 16 }}>
                  List Your Dental Clinic — <span style={{ color: 'var(--blue)' }}>Free Forever</span>
                </h2>
                <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
                  The first 250 dentists to join get a free listing permanently. No credit card, no monthly fees. Just more patients finding you on Google.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Link href="/for-dentists/register" className="btn btn-primary">Claim Your Free Listing</Link>
                  <Link href="/for-dentists" style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}>Learn more →</Link>
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 140, height: 140,
                  borderRadius: '50%',
                  background: '#fff',
                  border: '4px solid var(--blue)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'var(--shadow-md)',
                }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 36, fontWeight: 800, color: 'var(--blue)', lineHeight: 1 }}>47</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>of 250 claimed</div>
                </div>
                <div style={{ marginTop: 16, width: 140, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: '19%', height: '100%', background: 'var(--blue)', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>203 spots remaining</div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="home-section" style={{ padding: '72px 20px', background: 'var(--bg)' }}>
          <div className="container">
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Common Questions</p>
                <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800 }}>Frequently Asked Questions</h2>
              </div>
              <FaqAccordion items={FAQ_ITEMS} />
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={{ background: '#0A1628', padding: '56px 20px 24px', color: 'rgba(255,255,255,0.7)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, marginBottom: 48 }}>
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
              <h4 style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>For Patients</h4>
              {[`Find Dentists`, `Dental Implants ${city.cityName}`, `Teeth Whitening ${city.cityName}`, `Braces ${city.cityName}`, 'Emergency Dental'].map(link => (
                <div key={link} style={{ marginBottom: 10 }}>
                  <Link href="/dentists" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', transition: 'color 0.2s' }}>{link}</Link>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top Areas</h4>
              {areaList.slice(0, 6).map(area => (
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
        @media (max-width: 768px) {
          .nav-secondary-link { display: none !important; }
          .home-hero { padding: 48px 16px 64px !important; }
          .home-hero-sub { font-size: 15px !important; margin-bottom: 28px !important; }
          .home-stats { padding: 20px 16px !important; }
          .home-stats-grid { gap: 12px !important; grid-template-columns: repeat(2, 1fr) !important; }
          .home-stat-value { font-size: 22px !important; }
          .home-section { padding: 48px 16px !important; }
          .home-section-head { flex-direction: column !important; align-items: flex-start !important; margin-bottom: 24px !important; }
          .home-featured-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
          .home-cta-card { padding: 32px 22px !important; flex-direction: column !important; align-items: stretch !important; gap: 28px !important; text-align: left !important; }
        }
      `}</style>
    </>
  )
}
