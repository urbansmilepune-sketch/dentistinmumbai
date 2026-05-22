import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS } from '@/config/cities'
import NationalShell from './NationalShell'
import CitySelector from './CitySelector'

// National /for-dentists. Server-rendered. Pricing tiers are hidden
// during the launch phase — see /lib/tier.ts. The previous TIERS array
// and "Pricing" section have been removed; the page now reads as a
// pure value pitch without a price comparison surface.
//
// Success-metric rollups come via the service role so the numbers
// aren't blocked by analytics_events RLS the same way the homepage
// counter was.

const WHY_LIST = [
  { icon: '🦷', title: 'Patients searching by city, area, treatment', body: 'Local SEO that ranks. The dentistin[city].in domain matches exactly what patients type into Google.' },
  { icon: '💰', title: 'Zero commission, ever', body: 'Every rupee of patient revenue stays with you. Free for founding members — no credit card.' },
  { icon: '⚡', title: 'Live in 24 hours',  body: 'Submit your registration, we verify your MCI number, and your profile is publicly indexed within a business day.' },
  { icon: '📊', title: 'Real analytics',    body: 'See profile views, WhatsApp leads, call-clicks and appointments — not vanity metrics.' },
]

export default async function NationalForDentists() {
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Calendar-month window for "profile views this month" — mirrors the
  // homepage counter logic exactly so dentists comparing the two see
  // consistent numbers.
  const monthStart = new Date()
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const monthStartIso = monthStart.toISOString()

  const [
    { count: totalDentistsRaw },
    { count: profileViewsRaw },
    { count: appointmentsRaw },
  ] = await Promise.all([
    adminClient.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    adminClient.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event_type', 'profile_view').gte('created_at', monthStartIso),
    adminClient.from('appointments').select('*', { count: 'exact', head: true }).gte('created_at', monthStartIso),
  ])

  const totalDentists      = totalDentistsRaw  || 0
  const profileViewsMonth  = profileViewsRaw   || 0
  const appointmentsMonth  = appointmentsRaw   || 0
  const cityCount          = Object.keys(CITY_CONFIGS).length

  return (
    <NationalShell badge="For Dentists">
      {/* Hero */}
      <section style={{ padding: '56px 20px 32px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 42, lineHeight: 1.15, color: '#0F1923', marginBottom: 14 }}>
            List your clinic on India's dental network
          </h1>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.55, marginBottom: 28 }}>
            Patients in {cityCount} cities are already searching dentistin[city].in. Get verified, get listed, get enquiries — without paying commission on a single appointment.
          </p>
          <CitySelector />
        </div>
      </section>

      {/* Live numbers */}
      <section style={{ padding: '8px 20px 48px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <Stat value={totalDentists.toLocaleString('en-IN')}      label="Dentists already listed" />
            <Stat value={profileViewsMonth.toLocaleString('en-IN')}  label="Profile views this month" />
            <Stat value={appointmentsMonth.toLocaleString('en-IN')}  label="Appointments this month" />
            <Stat value="0%"                                         label="Commission on bookings" />
          </div>
        </div>
      </section>

      {/* Why list */}
      <section style={{ padding: '48px 20px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Why list with us</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              Built by people who run clinics
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {WHY_LIST.map(w => (
              <div key={w.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px' }}>
                <div style={{ fontSize: 22, marginBottom: 12 }}>{w.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#0F1923', marginBottom: 6 }}>{w.title}</h3>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing section intentionally removed during launch phase —
          see /lib/tier.ts. */}

      {/* Final CTA */}
      <section style={{ padding: '48px 20px 72px', background: '#0F1923' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#fff', marginBottom: 12 }}>
            Five minutes. Live in 24 hours.
          </h2>
          <p style={{ fontSize: 15, color: '#94A3B8', lineHeight: 1.6, marginBottom: 24 }}>
            Pick your city, register your clinic, upload your MCI registration, and we'll get you indexed and ready for patients within one business day.
          </p>
          <div style={{ background: '#fff', borderRadius: 14, padding: '20px', maxWidth: 520, margin: '0 auto' }}>
            <CitySelector />
          </div>
        </div>
      </section>
    </NationalShell>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '20px 22px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#1D4ED8', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 8, fontWeight: 600 }}>{label}</div>
    </div>
  )
}
