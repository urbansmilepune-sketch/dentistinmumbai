import Link from 'next/link'
import { LIVE_CITY_CONFIGS, OPENING_CITY_CONFIGS } from '@/config/cities'
import NationalShell from '../NationalShell'
import { STATE_PATHS, LIVE_DOTS, SOON_DOTS, VB_W, VB_H } from '../indiaMapData'
import { SPECIALTIES } from '@/lib/dentalSpecialties'
import LoginBox from './LoginBox'
import PatientsMenu from './PatientsMenu'

// dentistinindia.in home for signed-out visitors (Ashish's sketch, Nov 2026):
// India map + "India's first social platform for dentists" on the left, the
// dentist login on the right, "Register your profile" under it and "For
// patients" in the header. The strip under the fold stays public on purpose:
// it gives Google real text and crawlable links to every live city site.

interface Props {
  dentistCount: number
  caseCount: number
}

const PATIENT_TREATMENTS = ['implants', 'endodontics', 'orthodontics', 'cosmetic', 'periodontics', 'pediatric']

export default function NationalLanding({ dentistCount, caseCount }: Props) {
  const treatments = PATIENT_TREATMENTS
    .map(slug => SPECIALTIES.find(s => s.slug === slug))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map(s => ({ slug: s.slug, label: s.label }))
  const cities = LIVE_CITY_CONFIGS.slice(0, 8).map(c => ({ name: c.cityName, domain: c.domain }))

  const stats = [
    { value: dentistCount, label: 'dentists' },
    { value: LIVE_CITY_CONFIGS.length, label: 'cities live' },
    ...(caseCount > 0 ? [{ value: caseCount, label: 'cases shared' }] : [{ value: OPENING_CITY_CONFIGS.length, label: 'opening soon' }]),
  ]

  return (
    <NationalShell hideNav right={<PatientsMenu treatments={treatments} cities={cities} />}>
      <style>{`
        .nh-login{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:40px;align-items:center;max-width:1200px;margin:0 auto;padding:32px 24px 28px}
        .nh-map{position:relative;min-height:640px}
        .nh-map svg{position:absolute;left:0;top:30px;height:610px;width:auto;max-width:100%}
        .nh-hero{position:absolute;left:55%;top:0;max-width:340px;display:flex;flex-direction:column;gap:12px}
        .nh-hero h1{font-size:36px}
        .nh-foot{position:absolute;left:62%;bottom:10px;display:flex;flex-direction:column;gap:12px}
        .nh-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}
        .nh-ring{transform-box:fill-box;transform-origin:center;animation:nhring 2.4s ease-out infinite}
        @keyframes nhring{0%{transform:scale(1);opacity:.6}100%{transform:scale(3.2);opacity:0}}
        @media (prefers-reduced-motion:reduce){.nh-ring{animation:none;opacity:0}}
        @media (max-width:860px){
          .nh-login{grid-template-columns:1fr;gap:20px;padding:20px 16px}
          .nh-map{min-height:0;display:flex;flex-direction:column;gap:14px}
          .nh-map svg{position:static;height:300px;align-self:center}
          .nh-hero{position:static;max-width:none;order:-1;gap:8px}
          .nh-hero h1{font-size:28px}
          .nh-foot{position:static}
          .nh-strip{grid-template-columns:1fr;gap:16px}
        }
      `}</style>

      <section className="nh-login">
        <div className="nh-map">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Map of India showing DentistIn city sites">
            {STATE_PATHS.map(p => <path key={p.name} d={p.d} fill="#DCE5F2" stroke="#fff" strokeWidth={2} />)}
            {SOON_DOTS.map(d => <circle key={d.slug} cx={d.x} cy={d.y} r={7} fill="#fff" stroke="#94A3B8" strokeWidth={3} />)}
            {LIVE_DOTS.map((d, i) => (
              <a key={d.slug} href={`https://${d.domain}`} aria-label={`Dentists in ${d.name}`}>
                <title>{`Dentists in ${d.name}`}</title>
                <circle className="nh-ring" cx={d.x} cy={d.y} r={8} fill="none" stroke="#1D4ED8" strokeWidth={3} style={{ animationDelay: `${(i % 12) * 0.17}s` }} />
                <circle cx={d.x} cy={d.y} r={8} fill="#1D4ED8" />
              </a>
            ))}
          </svg>
          <div className="nh-hero">
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, color: '#0F1923', textWrap: 'balance' }}>
              India&apos;s first social platform for <span style={{ color: '#1D4ED8' }}>dentists</span>
            </h1>
            <p style={{ margin: 0, fontSize: 16, color: '#334155', lineHeight: 1.55 }}>
              Share cases, get second opinions from dentists across India, and build a name patients can find.
            </p>
          </div>
          <div className="nh-foot">
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {stats.map(s => (
                <div key={s.label}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: '#0F1923', fontVariantNumeric: 'tabular-nums' }}>{s.value.toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: 12.5, color: '#475569' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#334155' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1D4ED8' }} />City site live</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '1.6px solid #94A3B8' }} />Opening soon</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0, color: '#334155' }}>Dentist login</h2>
          <LoginBox />
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '16px 18px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 14 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#78350F" strokeWidth="2" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /><path d="M19 3v4M21 5h-4" /></svg>
            <p style={{ margin: 0, fontSize: 13.5, color: '#78350F', lineHeight: 1.5 }}>
              <strong style={{ display: 'block', fontSize: 15, color: '#0F1923', marginBottom: 2 }}>
                Not a user yet? <Link href="/claim" style={{ color: '#1D4ED8' }}>Register your profile</Link>
              </strong>
              Already listed on a DentistIn city site? Your profile is waiting. Claim it in 2 minutes, free.
            </p>
          </div>
        </div>
      </section>

      <section style={{ borderTop: '1px solid #E2E8F0', background: '#fff', padding: '28px 16px 32px' }}>
        <div style={{ maxWidth: 1104, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="nh-strip">
            {[
              { t: 'Post a case, get answers', b: 'X-rays, photos and one question. Dentists across India reply, and the best answers are marked helpful.', href: '/cases', cta: 'Browse cases' },
              { t: 'Build your name', b: 'Your cases and follow-ups become a public profile patients find when they search your name.', href: '/experts', cta: 'See expert profiles' },
              { t: 'Events and courses', b: 'Exhibitions, seminars, study clubs and hands-on courses across India in one calendar.', href: '/events', cta: 'See events' },
            ].map(x => (
              <div key={x.t} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 800, margin: 0, color: '#0F1923' }}>{x.t}</h2>
                <p style={{ margin: 0, fontSize: 13.5, color: '#475569', lineHeight: 1.55 }}>{x.b}</p>
                <Link href={x.href} style={{ fontSize: 13.5, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>{x.cta} →</Link>
              </div>
            ))}
          </div>
          {/* Crawlable links to every live city domain (discovery layer). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, marginRight: 6, color: '#0F1923' }}>Book a dentist:</span>
            {LIVE_CITY_CONFIGS.map(c => (
              <a key={c.citySlug} href={`https://${c.domain}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px solid #CBD5E1', background: '#fff', fontSize: 13, color: '#0F1923', textDecoration: 'none' }}>
                {c.cityName}
              </a>
            ))}
            <Link href="/cities" style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none', marginLeft: 4 }}>All cities →</Link>
          </div>
        </div>
      </section>
    </NationalShell>
  )
}
