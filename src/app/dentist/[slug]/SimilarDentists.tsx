// SECTION 10 — More dentists in {area}. Keeps the existing #similar anchor.
// Distance isn't reliably available, so we don't render it (per the spec's
// "only real data" rule); photo, name, specialty and fee are shown.

import Link from 'next/link'
import { NAVY, TEAL, BRAND_GRADIENT } from './profileTheme'
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
    <div className="profile-similar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {dentists.map(sd => {
        const specialty = (Array.isArray(sd.specialties) && sd.specialties[0]) || sd.qualifications || 'Dentist'
        return (
          <div key={sd.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            <Link href={`/dentist/${sd.slug}`} style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: '10px 12px', background: TEAL, color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              View profile
            </Link>
          </div>
        )
      })}
    </div>
  )
}
