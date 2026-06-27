import type { Metadata } from 'next'
import NationalShell from '@/components/national/NationalShell'
import TourismEnquiryForm from './TourismEnquiryForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dental Tourism in India | Save 70-80% on World-Class Treatment',
  description: 'NRI and international patients save up to 80% on dental implants, veneers, crowns and full-mouth restorations in India. State Dental Council-registered dentists, transparent pricing, English-speaking clinics.',
}

// /dental-tourism is national-flavoured and accessible from every domain;
// the page itself doesn't fetch host-specific data so it works the same
// wherever it's served. NationalShell wraps it with the network nav/footer
// so navigation between national pages stays consistent.
//
// All costs below are wholesale-range approximations researched at time
// of writing. The numbers are intentionally bracketed ("₹40k – ₹80k")
// because exact per-clinic quotes vary wildly; the table is for ballpark
// comparison, not pricing commitments.

interface CostRow {
  treatment: string
  india: string
  uk: string
  usa: string
  canada: string
  /** Savings band against the cheapest of UK/USA/Canada, rounded to a
   *  conservative range. Used as the visual headline. */
  saves: string
}

const COST_ROWS: CostRow[] = [
  { treatment: 'Single Dental Implant',     india: '₹25k – ₹80k',   uk: '£2,000 – £3,500',  usa: '$3,000 – $6,000', canada: 'CA$3,500 – CA$6,000', saves: '70-85%' },
  { treatment: 'Full-Mouth Implants (All-on-4)', india: '₹2.5L – ₹6L', uk: '£12,000 – £25,000', usa: '$20,000 – $35,000', canada: 'CA$22,000 – CA$32,000', saves: '75-85%' },
  { treatment: 'Porcelain Veneer (per tooth)', india: '₹10k – ₹25k', uk: '£500 – £1,200',    usa: '$1,000 – $2,500', canada: 'CA$1,200 – CA$2,500', saves: '75-85%' },
  { treatment: 'Crown (zirconia / e.max)',  india: '₹8k – ₹20k',    uk: '£500 – £1,000',    usa: '$1,000 – $3,000', canada: 'CA$1,000 – CA$2,500', saves: '70-85%' },
  { treatment: 'Root Canal + Crown',        india: '₹8k – ₹18k',    uk: '£700 – £1,500',    usa: '$1,200 – $2,500', canada: 'CA$1,400 – CA$2,400', saves: '75-85%' },
  { treatment: 'Smile Makeover (8 veneers)',india: '₹1L – ₹2.5L',   uk: '£5,000 – £10,000', usa: '$10,000 – $20,000', canada: 'CA$10,000 – CA$18,000', saves: '75-85%' },
  { treatment: 'Orthodontics / Clear Aligners', india: '₹40k – ₹2L', uk: '£2,500 – £6,000',  usa: '$3,000 – $8,000', canada: 'CA$4,000 – CA$8,000', saves: '60-75%' },
]

// Curated treatment → city recommendations. These reflect city brand
// strength (Goa = tourism-friendly travel; Pune/Mumbai = high
// concentration of cosmetic specialists; Ahmedabad/Surat = full-mouth
// implant centres of excellence) more than dentist count alone.
const CITY_RECS: { treatment: string; cities: string[]; reason: string }[] = [
  { treatment: 'Dental Implants & All-on-4', cities: ['Pune', 'Mumbai', 'Ahmedabad'],   reason: 'Highest concentration of implant specialists with international training. Same-day implants available at top clinics.' },
  { treatment: 'Smile Makeover & Veneers',   cities: ['Mumbai', 'Pune', 'Goa'],         reason: 'Top cosmetic dentists used by Bollywood actors and influencers. CAD/CAM same-week veneers.' },
  { treatment: 'Combined Treatment + Holiday', cities: ['Goa', 'Mumbai', 'Pune'],       reason: 'English-speaking clinics close to beaches and resorts. Treatment-and-stay packages with verified hotel partners.' },
  { treatment: 'Orthodontics & Aligners',    cities: ['Pune', 'Mumbai', 'Surat'],       reason: 'High-volume aligner clinics with shorter waitlists than UK / Canada. Remote review options post-return.' },
  { treatment: 'Pediatric & Family Dentistry', cities: ['Pune', 'Thane', 'Navi Mumbai'], reason: 'Specialist pedodontists with sedation expertise. Family-friendly hours and multi-patient discounts.' },
]

const CREDENTIALS_STEPS = [
  { n: 1, title: 'Check State Dental Council registration',  body: 'Every dentist on our network displays their State Dental Council number on their profile. You can verify it directly with their State Dental Council, or with the National Dental Commission (NDC), the national dental regulator.' },
  { n: 2, title: 'Look at real patient reviews',                   body: 'We publish reviews verified against confirmed appointments — not anonymous Google blurbs. Look for 30+ reviews with consistent themes.' },
  { n: 3, title: 'Insist on full treatment plans + warranty',      body: 'A reputable clinic gives you a written treatment plan, itemised costs, and a written warranty on implants and prosthetics (typically 5-10 years).' },
  { n: 4, title: 'Ask for X-rays + photos before you fly',         body: 'Send your existing X-rays and intra-oral photos by WhatsApp. The clinic should give you a preliminary plan and quote before you book travel.' },
]

export default function DentalTourismPage() {
  return (
    <NationalShell badge="Dental Tourism">
      {/* Hero */}
      <section style={{ padding: '56px 20px 32px', background: 'linear-gradient(180deg, #F8FAFC 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 42, lineHeight: 1.15, color: '#0F1923', marginBottom: 14 }}>
            India: the world's smartest <span style={{ color: '#1D4ED8' }}>dental tourism</span> destination
          </h1>
          <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.55, maxWidth: 700, margin: '0 auto' }}>
            Save 70-85% on world-class dental care — State Dental Council-registered specialists, identical materials and lab brands used in London or New York, and a verified clinic network across India's most travel-friendly cities.
          </p>
        </div>
      </section>

      {/* Cost comparison */}
      <section style={{ padding: '24px 20px 56px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Cost Comparison</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              The same treatment, a fraction of the price
            </h2>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 2px 6px rgba(15, 25, 35, 0.04)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Treatment', 'India', 'United Kingdom', 'United States', 'Canada', 'You save'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Treatment' ? 'left' : 'center', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COST_ROWS.map((row, i) => (
                  <tr key={row.treatment} style={{ borderTop: i === 0 ? 'none' : '1px solid #E2E8F0' }}>
                    <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 600, color: '#0F1923' }}>{row.treatment}</td>
                    <td style={{ padding: '14px 16px', fontSize: 14, color: '#1D4ED8', fontWeight: 700, textAlign: 'center' }}>{row.india}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B', textAlign: 'center' }}>{row.uk}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B', textAlign: 'center' }}>{row.usa}</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748B', textAlign: 'center' }}>{row.canada}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#DCFCE7', color: '#166534' }}>
                        {row.saves}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
            Ranges are wholesale-style approximations across major clinics in 2026. Final quotes vary by clinic, material brand, and case complexity. Get a personalised estimate via the form below.
          </p>
        </div>
      </section>

      {/* City recommendations */}
      <section style={{ padding: '56px 20px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Where to go</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              Best cities by treatment type
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {CITY_RECS.map(rec => (
              <div key={rec.treatment} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#0F1923', marginBottom: 10 }}>{rec.treatment}</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {rec.cities.map(c => (
                    <span key={c} style={{ fontSize: 12, padding: '3px 10px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, fontWeight: 600 }}>{c}</span>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{rec.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Credentials guidance */}
      <section style={{ padding: '56px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Due diligence</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923' }}>
              How to verify any dentist's credentials
            </h2>
          </div>

          <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CREDENTIALS_STEPS.map(s => (
              <li key={s.n} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 14 }}>
                <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: '#1D4ED8', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.n}
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0F1923', marginBottom: 4 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Contact form */}
      <section style={{ padding: '32px 20px 72px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Get a personalised plan</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923', marginBottom: 8 }}>
              Tell us about your case
            </h2>
            <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.55 }}>
              We'll come back within one business day with clinic recommendations, ballpark cost, and treatment timeline.
            </p>
          </div>
          <TourismEnquiryForm />
        </div>
      </section>
    </NationalShell>
  )
}
