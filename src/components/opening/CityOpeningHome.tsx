import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import OpeningNotifyForm from '@/components/opening/OpeningNotifyForm'
import { LIVE_CITY_CONFIGS, NATIONAL_ORIGIN, OPENING_MIN_DENTISTS, cityBrandName, type CityConfig } from '@/config/cities'
import { NAVY, TEAL, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'

// Homepage for a city that is still signing up its first dentists
// (CityConfig.opening, fewer than OPENING_MIN_DENTISTS active). Two jobs:
// get local dentists to register, and collect patients' WhatsApp numbers so
// they hear when booking opens. Kept out of search until the city switches
// to the full homepage (see src/lib/cityOpening.ts).

const WAITING_MIN = 10

export default function CityOpeningHome({ city, areas, dentistCount, waitingCount }: {
  city: CityConfig
  areas: string[]
  dentistCount: number
  waitingCount: number
}) {
  const joined = Math.min(dentistCount, OPENING_MIN_DENTISTS)
  const liveExamples = LIVE_CITY_CONFIGS.filter(c => ['pune', 'mumbai', 'bangalore'].includes(c.citySlug)).map(c => c.cityName)
  const moreLive = LIVE_CITY_CONFIGS.length - liveExamples.length

  return (
    <>
      <SiteHeader city={city} hideSearch patientOnly />
      <main className="op">
        <section className="op-hero">
          <div className="op-wrap">
            <span className="op-tag">Now opening in {city.cityName}</span>
            <h1>Find a trusted dentist in <em>{city.cityName}</em></h1>
            <p className="op-lead">
              We&apos;re signing up verified {city.cityName} dentists now. Leave your number and we&apos;ll message you on WhatsApp when booking opens in your area.
            </p>
            <OpeningNotifyForm citySlug={city.citySlug} areas={areas} />
            {waitingCount >= WAITING_MIN && (
              <p className="op-fine">{waitingCount} people in {city.cityName} are waiting</p>
            )}
          </div>
        </section>

        <section className="op-sec">
          <div className="op-wrap">
            <div className="op-dentist">
              <h2>Are you a dentist in {city.cityName}?</h2>
              <ul className="op-ticks">
                <li>Free clinic listing on {cityBrandName(city)}{city.domain.slice(city.domain.indexOf('.'))}</li>
                <li>Patients book you directly, zero commission</li>
                <li>Register in 2 minutes with your State Dental Council number</li>
              </ul>
              <div className="op-count">
                <span><b>{joined} of {OPENING_MIN_DENTISTS}</b> founding dentists</span>
                <span className="op-bar" aria-hidden="true"><i style={{ width: `${(joined / OPENING_MIN_DENTISTS) * 100}%` }} /></span>
              </div>
              <Link className="op-btn" href="/for-dentists/register">Register your clinic free</Link>
            </div>
          </div>
        </section>

        {areas.length > 0 && (
          <section className="op-sec op-sec-tight">
            <div className="op-wrap">
              <h2 className="op-h2">Areas we&apos;re covering</h2>
              <div className="op-areas">
                {areas.slice(0, 12).map(a => <span key={a} className="op-ar">{a}</span>)}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="op-foot">
        <div className="op-wrap">
          Part of <a href={NATIONAL_ORIGIN}>DentistInIndia.in</a> · Live in {liveExamples.join(', ')}{moreLive > 0 ? ` and ${moreLive} more cities` : ''}
        </div>
      </footer>

      <style>{`
        .op{overflow-x:hidden;background:#fff}
        .op-wrap{max-width:640px;margin:0 auto;padding:0 16px}
        .op-hero{background:linear-gradient(160deg,${NAVY} 0%,#13253A 100%);color:#fff;padding:28px 0 26px}
        .op-tag{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${TEAL};background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.35);border-radius:99px;padding:4px 10px}
        .op-hero h1{font-size:28px;line-height:1.12;margin:12px 0 8px;letter-spacing:-.025em;text-wrap:balance;color:#fff}
        .op-hero h1 em{font-style:normal;color:${TEAL}}
        .op-lead{font-size:14px;color:#CBD5E1;margin:0 0 16px;max-width:52ch}
        .op-form{display:grid;gap:10px;max-width:440px}
        .op-field{display:grid;gap:4px;font-size:12px;font-weight:600;color:#CBD5E1}
        .op-field select,.op-field input{font:inherit;font-size:15px;font-weight:500;color:${NAVY};background:#fff;border:0;border-radius:12px;padding:12px}
        .op-wa{font:inherit;font-size:15px;font-weight:800;background:#25D366;color:#053B1E;border:0;border-radius:12px;padding:13px;cursor:pointer}
        .op-wa:disabled{opacity:.7}
        .op-wa:focus-visible,.op-btn:focus-visible{outline:3px solid ${TEAL};outline-offset:2px}
        .op-err{color:#FCA5A5;font-size:13px;margin:0}
        .op-sent{background:rgba(37,211,102,.14);border:1px solid rgba(37,211,102,.5);border-radius:12px;padding:14px;font-size:14px;max-width:440px}
        .op-fine{font-size:12px;color:#94A3B8;margin:10px 0 0}
        .op-sec{padding:24px 0}
        .op-sec-tight{padding-top:0}
        .op-dentist{border:1.5px solid ${TEAL};background:#E6FAF7;border-radius:16px;padding:18px;display:grid;gap:12px}
        .op-dentist h2,.op-h2{font-size:19px;font-weight:800;color:${NAVY};margin:0;letter-spacing:-.01em}
        .op-ticks{list-style:none;margin:0;padding:0;display:grid;gap:7px;font-size:14px;color:#334155}
        .op-ticks li{display:flex;gap:8px}
        .op-ticks li::before{content:"✓";flex:none;width:18px;height:18px;border-radius:50%;background:${TEAL};color:#fff;font-size:11px;font-weight:800;display:grid;place-items:center;margin-top:1px}
        .op-count{display:flex;align-items:center;gap:10px;font-size:13px;color:#334155}
        .op-bar{flex:1;height:8px;border-radius:99px;background:#CBD5E1;overflow:hidden}
        .op-bar i{display:block;height:100%;background:${TEAL};border-radius:99px}
        .op-btn{display:block;text-align:center;background:${TEAL};color:#fff;font-weight:800;font-size:15px;border-radius:12px;padding:13px;text-decoration:none}
        .op-btn:hover{background:${TEAL_DARK}}
        .op-areas{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .op-ar{border:1px solid #E2E8F0;border-radius:99px;padding:5px 11px;font-size:13px;font-weight:600;color:${NAVY}}
        .op-foot{background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 0;font-size:12.5px;color:#64748B}
        .op-foot a{color:${TEAL_DARK};font-weight:700}
      `}</style>
    </>
  )
}
