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

const TEAM = [
  {
    name: 'Ashish Dighade',
    role: 'Founder & CEO',
    bio: 'Builds and runs the national dental network. Previously product + go-to-market across SaaS and consumer marketplaces.',
    initials: 'AD',
    color: '#1D4ED8',
  },
  {
    name: 'Dr Manish',
    role: 'Director',
    bio: 'Clinical director. Brings decades of dental practice experience to platform standards, verification, and clinical guidelines.',
    initials: 'DM',
    color: '#166534',
  },
  {
    name: 'Dr Sweety',
    role: 'Director',
    bio: 'Co-leads Urban Smile clinic operations and dentist onboarding. Sets the bar for what an MCI-verified profile should look like.',
    initials: 'DS',
    color: '#C2410C',
  },
]

const TIMELINE = [
  { year: '2024', title: 'Urban Smile clinic launches', body: 'Wakad, Pune — the family-run flagship that taught us what dentists actually need from a digital partner.' },
  { year: '2025', title: 'DentistInPune.in goes live', body: 'First city domain. Founding-member onboarding hits 50 verified dentists in three months.' },
  { year: '2026', title: '13 city sites, national network', body: 'Mumbai, Pune, Goa, Surat, Ahmedabad, Nashik, Nagpur, Thane and more — unified under DentistInIndia.in.' },
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
            Building India's <span style={{ color: '#1D4ED8' }}>trusted</span> dental network
          </h1>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.55 }}>
            We're Dentaura Prime LLP — a Pune-based healthcare-tech company building one platform for every Indian dental city, owned and operated by people who run clinics themselves.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: '32px 20px 48px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '32px', boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)' }}>
            <SectionTitle>Our mission</SectionTitle>
            <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.75, marginBottom: 24 }}>
              India has world-class dentists. Patients can't find them, and dentists can't reach the patients searching online. We're the bridge — verified profiles, transparent fees, real reviews, and direct WhatsApp booking. Zero commission, ever, because the dentist deserves to keep what they earn.
            </p>

            <SectionTitle>Why we're different</SectionTitle>
            <p style={{ fontSize: 16, color: '#475569', lineHeight: 1.75 }}>
              Most dental directories are run by ad-agencies who've never seen the inside of a clinic. We run <strong>Urban Smile</strong> in Wakad, Pune — every product decision is pressure-tested against a real practice that actually has to live with it.
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

      {/* Team */}
      <section style={{ padding: '56px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>The team</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              Founders and directors
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
            {TEAM.map(p => (
              <div key={p.name} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: p.color, color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  {p.initials}
                </div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', marginBottom: 4 }}>{p.name}</h3>
                <div style={{ fontSize: 12, fontWeight: 700, color: p.color, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>{p.role}</div>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{p.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section style={{ padding: '32px 20px 56px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Our story</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              From one clinic to a national network
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

      {/* Company */}
      <section style={{ padding: '32px 20px 64px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 32px' }}>
            <SectionTitle>The company</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 16 }}>
              <CompanyLine label="Entity"            value="Dentaura Prime LLP" />
              <CompanyLine label="Headquarters"      value="Pune, Maharashtra, India" />
              <CompanyLine label="Flagship clinic"   value="Urban Smile, Wakad, Pune" />
              <CompanyLine label="Founded"           value="2024" />
              <CompanyLine label="Email"             value={<a href="mailto:hello@dentistinindia.in" style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>hello@dentistinindia.in</a>} />
              <CompanyLine label="WhatsApp"          value={<a href="https://wa.me/917719903232" target="_blank" rel="noopener noreferrer" style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>+91 77199 03232</a>} />
            </div>
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

function CompanyLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#0F1923', fontWeight: 600 }}>{value}</div>
    </div>
  )
}
