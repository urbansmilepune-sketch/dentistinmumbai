import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import TickerBar from './TickerBar'
import ExpoPricingSection from './ExpoPricingSection'
import ProgressBar from './ProgressBar'
import HeroButtons from './HeroButtons'

const UNLOCK_AT = 250

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { count } = await supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const listedCount = count || 0
  const title = 'List Your Dental Clinic Free | dentistinmumbai.in'
  const description = `Join ${listedCount} dentists already listed on Mumbai's fastest growing dental directory. Free forever. No commission. Get patient enquiries from day 1.`
  const url = 'https://www.dentistinmumbai.in/for-dentists'
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title, description, url,
      siteName: 'dentistinmumbai.in',
      type: 'website',
      locale: 'en_IN',
    },
    twitter: { card: 'summary', title, description },
  }
}

export default async function ForDentistsPage() {
  const supabase = await createClient()

  const [{ count }, { data: areas }] = await Promise.all([
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('areas').select('name').order('name'),
  ])

  const listedCount = count || 0
  const spotsLeft = Math.max(0, UNLOCK_AT - listedCount)
  const pct = Math.min((listedCount / UNLOCK_AT) * 100, 100)
  const areaNames = (areas || []).map(a => a.name)

  const WHY_CARDS = [
    { icon: '📅', title: 'Smart Appointments',     desc: 'Walk-in, scheduled, state-machine flow — every booking moves through the right status automatically.' },
    { icon: '🦷', title: 'EMR & Prescriptions',    desc: 'Reusable templates, clickable chief-complaint chips, medications and procedures in one form.' },
    { icon: '💰', title: 'Billing & Invoices',     desc: 'Generate professional PDF invoices, track payments, send WhatsApp reminders for dues.' },
    { icon: '👥', title: 'Patient Records',        desc: 'Full PMS — visit notes, treatment plans, dental chart, X-ray vault, medical history.' },
    { icon: '📊', title: 'Analytics',              desc: 'Profile views, WhatsApp clicks, booking-to-show rates, engagement funnels — all visualised.' },
    { icon: '📲', title: 'WhatsApp Native',        desc: '24-hour reminders, post-visit summaries, payment-due nudges — every patient touchpoint, one tap.' },
  ]

  const FEATURES = [
    { icon: '📋', title: 'Full Clinic Profile' },
    { icon: '📅', title: 'Appointment Booking' },
    { icon: '📞', title: 'Direct Contact Buttons' },
    { icon: '🗺️', title: 'Google Maps Integration' },
    { icon: '⭐', title: 'Patient Reviews' },
    { icon: '📸', title: 'Photo Gallery' },
    { icon: '📊', title: 'Dashboard Analytics' },
    { icon: '🔔', title: 'Instant Lead Alerts' },
  ]

  const STEPS = [
    { num: '01', title: 'Fill the Registration Form', desc: 'Share your name, clinic details, area, MCI registration. Takes 3 minutes.', tag: 'Takes 3 minutes' },
    { num: '02', title: 'Our Team Reviews & Verifies', desc: 'We verify your MCI/DCI registration. Takes up to 24 hours.', tag: 'Within 24 hours' },
    { num: '03', title: 'We Build Your Profile', desc: 'We create your complete profile — hours, treatments, photos, map pin, booking.', tag: 'We do this for you' },
    { num: '04', title: 'Go Live & Start Getting Patients', desc: 'Profile goes live, indexed by Google, visible to thousands of patients.', tag: 'Immediate' },
  ]

  const TESTIMONIALS = [
    { name: 'Dr. Rahul Mehta', clinic: 'Mehta Advanced Dentistry', area: 'Andheri', text: 'Listed in 10 minutes and got my first patient enquiry the same week.' },
    { name: 'Dr. Priya Sharma', clinic: 'Sharma Dental Studio', area: 'Bandra', text: 'Completely free and the setup was very easy. My clinic now shows up when people search for dentists in Bandra.' },
    { name: 'Dr. Sneha Kulkarni', clinic: 'Kulkarni Dental Care', area: 'Powai', text: 'The dashboard shows exactly how many people viewed my profile and clicked WhatsApp.' },
  ]

  return (
    <>
      {/* Ticker */}
      <TickerBar listedCount={listedCount} spotsLeft={spotsLeft} />

      {/* NAV */}
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <nav className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="DentistInMumbai.in" style={{ height: 36, width: 'auto', display: 'block' }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/dentists" style={{ padding: '8px 16px', fontWeight: 500, fontSize: 14, color: 'var(--text-secondary)' }}>For Patients →</Link>
            <Link href="/for-dentists/login" style={{ padding: '8px 18px', fontWeight: 600, fontSize: 14, color: 'var(--blue)', border: '1.5px solid var(--blue)', borderRadius: 8 }}>Dentist Login</Link>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #003F7A 0%, #0057A8 50%, #1A6FC4 100%)', padding: '72px 20px 80px', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }} />
        <div aria-hidden="true" style={{ position: 'absolute', bottom: -80, left: '5%', width: 300, height: 300, background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }} />

        <div className="container" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {/* Platform badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 40, marginBottom: 28 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FBBF24', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#FDE68A' }}>🏆 Mumbai&apos;s #1 Dental Practice Platform</span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(2rem, 5vw, 3.25rem)', color: '#fff', maxWidth: 680, marginBottom: 20, lineHeight: 1.15 }}>
            List Free.<br />Manage <span style={{ color: '#FBBF24' }}>Everything.</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, maxWidth: 620, marginBottom: 48, lineHeight: 1.7 }}>
            Patients find you on Google. You manage appointments, EMR, billing, prescriptions, and WhatsApp — all in one place. Free forever.
          </p>

          {/* Progress bar */}
          <div style={{ width: '100%', maxWidth: 540, marginBottom: 36 }}>
            <ProgressBar listedCount={listedCount} spotsLeft={spotsLeft} pct={pct} />
          </div>

          {/* CTA buttons */}
          <div id="register" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <HeroButtons listedCount={listedCount} areaNames={areaNames} />
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section style={{ background: 'var(--blue-light)', padding: '20px', borderBottom: '1px solid #BFDBFE' }}>
        <div className="container">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 24 }}>
            {['No credit card required', 'Profile live within 24 hours', 'Direct booking from your profile', 'No commission on appointments'].map(item => (
              <span key={item} style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-dark)' }}>✅ {item}</span>
            ))}
          </div>
        </div>
      </section>

      {/* WHY LIST */}
      <section style={{ padding: '80px 20px', background: '#fff' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Why List on DentistInMumbai</p>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', maxWidth: 560, margin: '0 auto' }}>
              Patients in Mumbai are searching. Make sure they find you.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {WHY_CARDS.map(card => (
              <div key={card.title} style={{ padding: '24px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{card.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{card.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOUNDING PERKS */}
      <section style={{ padding: '80px 20px', background: 'linear-gradient(135deg, #0A1628 0%, #003F7A 100%)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ color: '#FBBF24', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Founding Member Exclusive</p>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', color: '#fff', maxWidth: 500, margin: '0 auto' }}>
              Why List Now — Not Later
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20, marginBottom: 56 }}>
            {[
              { icon: '🏅', title: 'Permanent Founding Member Status', desc: 'Badge visible to all patients forever — signals trust and seniority on the platform.' },
              { icon: '📈', title: 'Priority Placement', desc: 'Ahead of dentists who list later, always — in search results, area pages, and recommendations.' },
              { icon: '💰', title: 'Free Forever Guarantee', desc: 'Basic profile stays free whatever pricing we introduce for future members.' },
              { icon: '🎤', title: 'Input on New Features', desc: 'Consulted before new features go live — you help shape the product.' },
            ].map(perk => (
              <div key={perk.title} style={{
                padding: '24px', borderRadius: 16,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{perk.icon}</div>
                <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 20, marginBottom: 10, border: '1px solid #FDE68A' }}>🏅 FOUNDING MEMBER</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 8 }}>{perk.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>{perk.desc}</p>
              </div>
            ))}
          </div>

          {/* Second progress bar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <ProgressBar listedCount={listedCount} spotsLeft={spotsLeft} pct={pct} showButton={false} />
            <HeroButtons listedCount={listedCount} areaNames={areaNames} orange />
          </div>
        </div>
      </section>

      {/* WHAT'S INCLUDED */}
      <section style={{ padding: '80px 20px', background: 'var(--bg)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>What's Included</p>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.25rem)', marginBottom: 12 }}>Everything in Your Free Profile</h2>
            <p style={{ color: 'var(--muted)', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>No stripped-down free tier. Full profile. All features. No credit card.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, maxWidth: 720, margin: '0 auto' }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46', background: '#DCFCE7', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>FREE</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px 20px', background: '#fff' }}>
        <div className="container" style={{ maxWidth: 680 }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>How It Works</p>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.25rem)' }}>Listed in Under 10 Minutes</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {STEPS.map((step, i) => (
              <div key={step.num} style={{ display: 'flex', gap: 20, position: 'relative' }}>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div style={{ position: 'absolute', left: 24, top: 52, bottom: -20, width: 2, background: 'var(--border)', zIndex: 0 }} />
                )}
                {/* Step number */}
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, flexShrink: 0, position: 'relative', zIndex: 1 }}>
                  {step.num}
                </div>
                <div style={{ paddingBottom: 36 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>{step.title}</h3>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)', background: 'var(--blue-light)', padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{step.tag}</span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '80px 20px', background: 'var(--bg)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Dentists Love It</p>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.25rem)' }}>What Founding Members Say</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {TESTIMONIALS.map(t => (
              <div key={t.name} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
                <div style={{ color: '#F59E0B', fontSize: 18, marginBottom: 12 }}>★★★★★</div>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20, fontStyle: 'italic' }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👨‍⚕️</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.clinic} · {t.area}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ padding: '80px 20px', background: 'linear-gradient(135deg, #003F7A, #0057A8)', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBBF24', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#FDE68A' }}>🏅 Founding Member Programme</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.75rem)', color: '#fff', marginBottom: 16 }}>
            Your patients are searching right now.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 17, marginBottom: 36 }}>
            Join {listedCount} dentists already listed. Free forever. No catch.
          </p>
          <HeroButtons listedCount={listedCount} areaNames={areaNames} orange large />
        </div>
      </section>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }`}</style>
    </>
  )
}

