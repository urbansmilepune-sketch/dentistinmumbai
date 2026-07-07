// SECTION 3 — Proof strip. Three equal columns on a light card. Designed so
// the zero-review case reads as "New", never "0 reviews".

import { NAVY, TEAL } from './profileTheme'
import { StarIcon } from './profileIcons'

interface Props {
  avgRating: string | null
  reviewCount: number
  experienceYears: number | null
  topSpecialty: string | null
  qualifications: string | null
}

const labelStyle: React.CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 3, letterSpacing: '0.01em' }
const valueStyle: React.CSSProperties = { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, color: NAVY, lineHeight: 1.15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 24 }

// Reviews UI is globally disabled for now. Flip to true to restore the
// rating / "New" column on the profile proof strip.
const REVIEWS_ENABLED = false

export default function ProofStrip({ avgRating, reviewCount, experienceYears, topSpecialty, qualifications }: Props) {
  const specialty = topSpecialty || (qualifications && qualifications.trim()) || 'MDS'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: REVIEWS_ENABLED ? '1fr 1fr 1fr' : '1fr 1fr',
      background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Col 1 — rating / New (hidden while reviews are disabled) */}
      {REVIEWS_ENABLED && (
        <div style={{ padding: '14px 8px', textAlign: 'center' }}>
          {reviewCount > 0 ? (
            <>
              <div style={valueStyle}><StarIcon size={17} color="#F59E0B" />{avgRating}</div>
              <div style={labelStyle}>{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</div>
            </>
          ) : (
            <>
              <div style={valueStyle}>
                <span style={{ fontSize: 12, fontWeight: 800, color: TEAL, background: '#CCFBF1', padding: '3px 10px', borderRadius: 999, letterSpacing: '0.03em' }}>NEW</span>
              </div>
              <div style={labelStyle}>Be the first</div>
            </>
          )}
        </div>
      )}

      {/* Col 2 — experience */}
      <div style={{ padding: '14px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
        <div style={valueStyle}>{experienceYears && experienceYears > 0 ? `${experienceYears} yrs` : '—'}</div>
        <div style={labelStyle}>Experience</div>
      </div>

      {/* Col 3 — specialty / qualification */}
      <div style={{ padding: '14px 8px', textAlign: 'center' }}>
        <div style={{ ...valueStyle, fontSize: 14, padding: '0 4px' }} title={specialty}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{specialty}</span>
        </div>
        <div style={labelStyle}>Specialty</div>
      </div>
    </div>
  )
}
