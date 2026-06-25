// SECTION 10 — More dentists in {area}. Keeps the existing #similar anchor.
// Distance isn't reliably available, so we don't render it (per the spec's
// "only real data" rule); photo, name, specialty and fee are shown.
//
// The ENTIRE card is a single <Link> to /dentist/[slug] (previously only the
// little button navigated, which read as "stuck" on tap). Responsive grid:
// 2 columns on mobile, 3 on desktop.

import Link from 'next/link'
import { NAVY, TEAL, TEAL_DARK, BRAND_GRADIENT } from './profileTheme'
import { normalizeDrName, initialsFrom } from './profileTheme'

interface SimilarDentist {
  id: string
  name: string
  slug: string
  consultation_fee: number | null
  profile_photo: string | null
  specialties: string[] | null
  qualifications: string | null
}

export default function SimilarDentists({ dentists }: { dentists: SimilarDentist[] }) {
  return (
    <div className="profile-similar-grid">
      {dentists.map(sd => {
        const specialty = (Array.isArray(sd.specialties) && sd.specialties[0]) || sd.qualifications || 'Dentist'
        return (
          <Link key={sd.id} href={`/dentist/${sd.slug}`} className="profile-similar-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
                background: sd.profile_photo ? `url(${sd.profile_photo}) center/cover` : BRAND_GRADIENT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: 'var(--font-heading)',
              }}>
                {!sd.profile_photo && initialsFrom(sd.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeDrName(sd.name)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{specialty}</div>
              </div>
            </div>
            {sd.consultation_fee ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Consult: <strong style={{ color: NAVY }}>₹{sd.consultation_fee.toLocaleString('en-IN')}</strong></div>
            ) : null}
            <span className="profile-similar-cta" aria-hidden>View profile →</span>
          </Link>
        )
      })}

      <style>{`
        .profile-similar-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        .profile-similar-card {
          display: flex; flex-direction: column; gap: 10px;
          background: #fff; border: 1px solid var(--border); border-radius: 14px;
          padding: 16px;
          text-decoration: none;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .profile-similar-card:hover {
          border-color: ${TEAL};
          box-shadow: 0 4px 14px rgba(20,184,166,0.12);
          transform: translateY(-2px);
        }
        .profile-similar-cta {
          margin-top: auto;
          text-align: center;
          padding: 9px 12px;
          background: ${TEAL};
          color: #fff;
          border-radius: 10px;
          font-weight: 700;
          font-size: 13px;
        }
        .profile-similar-card:hover .profile-similar-cta { background: ${TEAL_DARK}; }
        @media (min-width: 769px) {
          .profile-similar-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}
