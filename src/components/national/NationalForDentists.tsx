import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CITY_CONFIGS } from '@/config/cities'
import NationalShell from './NationalShell'
import CitySelector from './CitySelector'

// National /for-dentists. Server-rendered. Pricing tiers mirror the
// live billing in src/app/api/payments/create-order/route.ts and
// src/app/for-dentists/dashboard/upgrade/PlanSelector.tsx — Silver
// ₹499/mo, Gold ₹999/mo, Featured ₹2,499/mo. The "Free" tier exists
// on every dentist row (default tier) so it's listed here even though
// no checkout flow surfaces it.
//
// Success-metric rollups come via the service role so the numbers
// aren't blocked by analytics_events RLS the same way the homepage
// counter was.

const TIERS = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    color: '#475569',
    bg: '#F8FAFC',
    border: '#CBD5E1',
    headline: 'Get listed and get found',
    features: [
      'Full clinic profile, indexed on Google',
      'Direct WhatsApp + phone enquiries',
      'Patient reviews',
      'Up to 1 location',
      'Basic appointment booking',
    ],
    cta: 'Start free',
  },
  {
    name: 'Silver',
    price: '₹499',
    period: '/ month',
    color: '#334155',
    bg: '#F1F5F9',
    border: '#94A3B8',
    headline: 'Multi-location & staff',
    features: [
      'Everything in Free',
      'Up to 5 clinic locations',
      'Staff access + role-based dashboards',
      'EMR templates',
      'Communications (email blasts)',
    ],
    cta: 'Choose Silver',
  },
  {
    name: 'Gold',
    price: '₹999',
    period: '/ month',
    color: '#92400E',
    bg: '#FEF3C7',
    border: '#FDE68A',
    badge: 'Most popular',
    headline: 'Full marketing + analytics',
    features: [
      'Everything in Silver',
      'Higher placement in search results',
      'Featured badge on profile + reviews',
      'Full marketing analytics dashboard',
      'Priority support',
    ],
    cta: 'Choose Gold',
  },
  {
    name: 'Featured',
    price: '₹2,499',
    period: '/ month',
    color: '#C2410C',
    bg: '#FFEDD5',
    border: '#FDBA74',
    headline: 'Top spot in your city',
    features: [
      'Everything in Gold',
      'Top placement on city homepage',
      'Featured in every relevant area + treatment page',
      'Co-marketing on the network',
      'White-glove onboarding',
    ],
    cta: 'Contact us',
  },
]

const WHY_LIST = [
  { icon: '🦷', title: 'Patients searching by city, area, treatment', body: 'Local SEO that ranks. The dentistin[city].in domain matches exactly what patients type into Google.' },
  { icon: '💰', title: 'Zero commission, ever', body: 'You pay only the platform fee (if you upgrade). Every rupee of patient revenue stays with you.' },
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

      {/* Pricing */}
      <section style={{ padding: '56px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Pricing</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923', marginBottom: 8 }}>
              Plans that grow with your practice
            </h2>
            <p style={{ fontSize: 14, color: '#64748B' }}>Patients pay nothing — ever. You pay only if you choose to upgrade.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
            {TIERS.map(t => (
              <div
                key={t.name}
                style={{
                  position: 'relative',
                  background: '#fff',
                  border: `1.5px solid ${(t as any).badge ? t.color : t.border}`,
                  borderRadius: 16,
                  padding: '24px 22px',
                  boxShadow: (t as any).badge ? '0 8px 24px rgba(146, 64, 14, 0.12)' : '0 2px 6px rgba(15, 25, 35, 0.04)',
                }}
              >
                {(t as any).badge && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: t.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {(t as any).badge}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, color: t.color, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{t.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, color: '#0F1923', lineHeight: 1 }}>{t.price}</span>
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>{t.period}</span>
                </div>
                <p style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 16 }}>{t.headline}</p>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {t.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                      <span style={{ color: '#1D4ED8', flexShrink: 0 }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center' }}>
                  Available on every city site after registration
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
