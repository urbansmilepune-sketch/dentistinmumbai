import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS } from '@/config/cities'
import { COMING_SOON_CITIES } from '@/config/citiesNational'
import NationalShell from './NationalShell'

// National /about. Server-rendered — fetches live platform numbers
// (total dentists, total patients, total appointments) via the service-
// role client because those reads need to bypass per-row RLS. The
// numbers shown are platform-wide aggregates, never anything tied to a
// specific dentist or patient, so service-role at the page level is the
// same trust model used by the national homepage counters.
//
// Copy on this page is deliberately person-and-clinic anonymous: the
// platform talks about its mission and the network it serves, not the
// people behind it.

const TIMELINE = [
  { year: '2025', title: 'First city sites go live',           body: 'Verified dentists across the early pilot cities — the founding cohort that shaped how every profile is reviewed and listed today.' },
  { year: '2026', title: '13 cities, one unified network',     body: 'Mumbai, Pune, Goa, Surat, Ahmedabad, Nashik, Nagpur, Thane and more — unified under one national directory at DentistInIndia.in.' },
  { year: 'Next', title: '50 cities, every Indian state',      body: 'Coverage is rolling out city-by-city across every Indian state, with a launch waitlist already capturing demand for the next 50 metros.' },
]

export default async function NationalAbout() {
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Three platform-wide counts. Bundled in a single Promise.all so the
  // about page loads in one round-trip.
  const [
    { count: totalDentistsRaw },
    { count: totalPatientsRaw },
    { count: totalAppointmentsRaw },
  ] = await Promise.all([
    adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminClient.from('patients').select('*', { count: 'exact', head: true }),
    adminClient.from('appointments').select('*', { count: 'exact', head: true }),
  ])

  const totalDentists     = totalDentistsRaw     || 0
  const totalPatients     = totalPatientsRaw     || 0
  const totalAppointments = totalAppointmentsRaw || 0
  const liveCities        = Object.keys(CITY_CONFIGS).length
  const totalCities       = liveCities + COMING_SOON_CITIES.length

  const STATS = [
    { value: totalDentists.toLocaleString('en-IN'),     label: 'Verified dentists' },
    { value: totalPatients.toLocaleString('en-IN'),     label: 'Patients on platform' },
    { value: totalAppointments.toLocaleString('en-IN'), label: 'Appointments booked' },
    { value: `${liveCities} / ${totalCities}`,          label: 'Cities live / planned' },
  ]

  return (
    <NationalShell badge="About">
      {/* Hero */}
      <section style={{ padding: '56px 20px 24px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, lineHeight: 1.15, color: '#0F1923', marginBottom: 14 }}>
            Making quality dental care <span style={{ color: '#1D4ED8' }}>accessible</span> to every Indian
          </h1>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.55 }}>
            DentistIn is a national dental network built by dental professionals — one verified platform for every Indian city, owned and run by people who understand what patients and clinics actually need.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: '32px 20px 48px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '32px', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
            <SectionTitle>Our mission</SectionTitle>
            <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.75, marginBottom: 24 }}>
              India has world-class dentists. Patients can't find them, and dentists can't reach the patients searching online. We're the bridge — verified profiles, transparent fees, real reviews, and direct booking. Zero commission, ever, because the dentist deserves to keep what they earn.
            </p>

            <SectionTitle>Why we're different</SectionTitle>
            <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.75 }}>
              Most dental directories are run by ad-agencies who have never seen the inside of a clinic. DentistIn is built by dental professionals — every product decision is pressure-tested against a real practice that actually has to live with it.
            </p>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <section style={{ padding: '24px 20px 56px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>By the numbers</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              Where the platform stands today
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {STATS.map(s => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px 24px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: '#1D4ED8', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 8, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built by */}
      <section style={{ padding: '56px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Who builds it</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              Built by dental professionals
            </h2>
          </div>
          <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.75, textAlign: 'center' }}>
            DentistIn is owned and operated by dental practitioners who run their own clinics. Every onboarding flow, every verification check, every patient touchpoint is shaped by people who sit on both sides of the chair — and live with the consequences of every product call we make.
          </p>
        </div>
      </section>

      {/* Timeline */}
      <section style={{ padding: '32px 20px 56px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Our story</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              From a few cities to a national network
            </h2>
          </div>
          <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {TIMELINE.map(t => (
              <li key={t.year} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 22px', display: 'grid', gridTemplateColumns: '80px 1fr', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#1D4ED8' }}>{t.year}</div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#0F1923', marginBottom: 4 }}>{t.title}</h3>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{t.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Contact */}
      <section style={{ padding: '32px 20px 64px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 32px', textAlign: 'center' }}>
            <SectionTitle>Get in touch</SectionTitle>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 14 }}>
              For partnership, press, or general enquiries:
            </p>
            <a
              href="mailto:hello@dentistinindia.in"
              style={{ display: 'inline-block', padding: '11px 22px', minHeight: 44, background: '#1D4ED8', color: '#fff', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
            >
              hello@dentistinindia.in
            </a>
          </div>
        </div>
      </section>
    </NationalShell>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, color: '#0F1923', marginBottom: 12 }}>
      {children}
    </h2>
  )
}
