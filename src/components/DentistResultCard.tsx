// Result-page dentist card (area + treatment listings). Navy/teal patient-trust
// design, mirroring the rebuilt profile page. Deliberately leaner than the
// shared DentistCard: TWO CTAs only — a light "View profile" and a teal "Book"
// — plus a stretched overlay link so the whole card navigates to the profile.
//
// Server component: it's all links + inline SVG, no client interactivity. The
// closest/best match in a result set can be flagged via `highlight`, which
// draws a teal border and a small badge.

import Link from 'next/link'
import { cdnImg } from '@/lib/cloudinary'
import {
  NAVY, TEAL, TEAL_DARK, TEAL_SOFT, BRAND_GRADIENT,
  normalizeDrName, initialsFrom,
} from '@/app/dentist/[slug]/profileTheme'
import { CheckIcon, StarIcon, MapPinIcon } from '@/app/dentist/[slug]/profileIcons'
import { getOpenStatus } from '@/lib/openStatus'

interface Treatment { name: string; slug: string }

export interface ResultDentist {
  id: string
  slug: string
  name: string
  clinic_name: string | null
  qualifications: string | null
  experience_years: number
  gender: string | null
  consultation_fee: number
  emi_available?: boolean
  is_verified: boolean
  profile_photo: string | null
  working_hours: any
  areas: { name: string; slug: string } | null
  dentist_treatments?: { treatments: Treatment }[]
  avg_rating?: number | null
  review_count?: number | null
  distance_km?: number | null
}

type Highlight = 'closest' | 'best' | null

interface Props {
  dentist: ResultDentist
  /** Flags this card as the closest (GPS) or best (default sort) match. */
  highlight?: Highlight
  /** Treatment-context note, e.g. "Does root canals" — used on treatment pages. */
  treatmentNote?: string | null
}

// Reviews UI is globally disabled for now. Flip to true to restore star
// ratings / review counts on this card.
const REVIEWS_ENABLED = false

export default function DentistResultCard({ dentist: d, highlight = null, treatmentNote = null }: Props) {
  const name = normalizeDrName(d.name)
  const open = getOpenStatus(d.working_hours)
  const reviewCount = d.review_count || 0
  const rating = d.avg_rating || 0
  const hasReviews = reviewCount > 0 && rating > 0
  const distance = typeof d.distance_km === 'number' && Number.isFinite(d.distance_km) ? d.distance_km : null

  // Sub-line: qualifications · experience. Both optional — show what's real.
  const subBits: string[] = []
  if (d.qualifications) subBits.push(d.qualifications)
  if (d.experience_years > 0) subBits.push(`${d.experience_years} yrs exp`)

  const badgeLabel = highlight === 'closest' ? 'Closest to you' : highlight === 'best' ? 'Best match' : null
  const highlighted = !!badgeLabel

  return (
    <article className={`drc-card${highlighted ? ' drc-card-hl' : ''}`} style={{ borderColor: highlighted ? TEAL : '#E2E8F0', borderWidth: highlighted ? 2 : 1 }}>
      {badgeLabel && <span className="drc-badge">{badgeLabel}</span>}

      {/* Stretched overlay — the whole card navigates to the profile. The CTA
          row below sits above this via z-index so each keeps its own target. */}
      <Link href={`/dentist/${d.slug}`} className="drc-overlay" aria-label={`View profile of ${name}`} />

      <div className="drc-top">
        <div className="drc-avatar" style={{ background: d.profile_photo ? undefined : BRAND_GRADIENT }}>
          {d.profile_photo
            ? <img src={cdnImg(d.profile_photo, 400)} alt={name} />
            : <span>{initialsFrom(d.name)}</span>}
        </div>
        <div className="drc-info">
          <div className="drc-name-row">
            <h3 className="drc-name">{name}</h3>
            {d.is_verified && (
              <span className="drc-verified" title="Verified">
                <CheckIcon size={11} color="#fff" strokeWidth={3} />
              </span>
            )}
          </div>
          {subBits.length > 0 && <p className="drc-sub">{subBits.join(' · ')}</p>}
          {treatmentNote && <p className="drc-note">{treatmentNote}</p>}
          {d.clinic_name && <p className="drc-clinic">{d.clinic_name}{d.areas?.name ? ` · ${d.areas.name}` : ''}</p>}
        </div>
      </div>

      <div className="drc-meta">
        {open.state !== 'none' && (
          <span className="drc-open" style={{ color: open.state === 'open' ? '#047857' : '#DC2626' }}>
            <span className="drc-dot" style={{ background: open.state === 'open' ? '#10B981' : '#DC2626' }} />
            {open.label}
          </span>
        )}
        {distance !== null && (
          <span className="drc-distance"><MapPinIcon size={13} color={TEAL_DARK} /> {distance.toFixed(1)} km</span>
        )}
        {REVIEWS_ENABLED && (hasReviews ? (
          <span className="drc-rating"><StarIcon size={13} /> {rating.toFixed(1)} <span className="drc-rating-count">({reviewCount})</span></span>
        ) : (
          <span className="drc-new">New</span>
        ))}
      </div>

      <div className="drc-footer">
        <div className="drc-fee">
          <span className="drc-fee-label">Consultation</span>
          <span className="drc-fee-amount">{d.consultation_fee ? `₹${d.consultation_fee.toLocaleString('en-IN')}` : 'Call for price'}</span>
        </div>
        <div className="drc-cta-row">
          <Link href={`/dentist/${d.slug}`} className="drc-cta drc-cta-secondary">View profile</Link>
          <Link href={`/book/${d.slug}`} className="drc-cta drc-cta-primary" rel="nofollow">Book</Link>
        </div>
      </div>

      <style>{`
        .drc-card {
          position: relative;
          display: flex; flex-direction: column; gap: 12px;
          /* box-sizing:border-box is global (globals.css). width/max-width:100%
             keep the card from ever exceeding its column on mobile, so the
             clinic ellipsis and the CTA row stay inside the viewport. */
          width: 100%; max-width: 100%;
          background: #fff; border-style: solid; border-radius: 16px;
          padding: 16px;
          transition: border-color .15s, box-shadow .15s, transform .15s;
        }
        .drc-card:hover { box-shadow: 0 6px 20px rgba(15,23,42,0.08); transform: translateY(-2px); }
        .drc-badge {
          position: absolute; top: -10px; left: 16px; z-index: 2;
          background: ${TEAL}; color: #fff; font-size: 11px; font-weight: 800;
          letter-spacing: .03em; text-transform: uppercase;
          padding: 4px 10px; border-radius: 20px;
        }
        .drc-overlay { position: absolute; inset: 0; z-index: 1; border-radius: 16px; }
        .drc-top { display: flex; gap: 14px; align-items: flex-start; }
        .drc-avatar {
          width: 60px; height: 60px; border-radius: 14px; flex-shrink: 0; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-weight: 800; font-size: 18px; font-family: var(--font-heading);
        }
        .drc-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }
        .drc-info { flex: 1; min-width: 0; }
        .drc-name-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .drc-name { font-family: var(--font-heading); font-weight: 800; font-size: 16px; color: ${NAVY}; line-height: 1.25; overflow-wrap: anywhere; }
        .drc-verified {
          display: inline-flex; align-items: center; justify-content: center;
          width: 17px; height: 17px; border-radius: 50%; background: ${TEAL}; flex-shrink: 0;
        }
        .drc-sub { font-size: 13px; color: #475569; margin-top: 3px; line-height: 1.4; }
        .drc-note { font-size: 12.5px; color: ${TEAL_DARK}; font-weight: 600; margin-top: 3px; }
        .drc-clinic { font-size: 12.5px; color: #94A3B8; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .drc-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 12.5px; font-weight: 600; }
        .drc-open { display: inline-flex; align-items: center; gap: 6px; }
        .drc-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
        .drc-distance { display: inline-flex; align-items: center; gap: 4px; color: ${TEAL_DARK}; }
        .drc-rating { display: inline-flex; align-items: center; gap: 4px; color: ${NAVY}; }
        .drc-rating-count { color: #94A3B8; font-weight: 500; }
        .drc-new { background: ${TEAL_SOFT}; color: ${TEAL_DARK}; font-weight: 700; font-size: 11.5px; padding: 2px 9px; border-radius: 20px; }
        .drc-footer {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
          border-top: 1px solid #F1F5F9; padding-top: 12px;
        }
        .drc-fee { display: flex; flex-direction: column; }
        .drc-fee-label { font-size: 11px; color: #94A3B8; }
        .drc-fee-amount { font-family: var(--font-heading); font-weight: 800; font-size: 18px; color: ${NAVY}; }
        .drc-cta-row { display: flex; gap: 8px; position: relative; z-index: 2; flex-shrink: 0; }
        .drc-cta {
          display: inline-flex; align-items: center; justify-content: center;
          min-height: 44px; padding: 0 18px; border-radius: 10px;
          font-family: var(--font-body); font-weight: 700; font-size: 14px; text-decoration: none;
          transition: background .15s, border-color .15s;
        }
        .drc-cta:active { transform: scale(0.98); }
        .drc-cta-secondary { background: #fff; color: ${NAVY}; border: 1.5px solid #E2E8F0; }
        .drc-cta-secondary:hover { border-color: ${NAVY}; }
        .drc-cta-primary { background: ${TEAL}; color: #fff; }
        .drc-cta-primary:hover { background: ${TEAL_DARK}; }
        @media (max-width: 600px) {
          .drc-footer { flex-direction: column; align-items: stretch; }
          .drc-cta-row { width: 100%; }
          /* min-width:0 lets each button shrink below its content width so two
             CTAs always split the row evenly and stay fully tappable at 360px —
             without it, default min-width:auto pushes "Book" off-screen. */
          .drc-cta { flex: 1 1 0; min-width: 0; min-height: 48px; }
          /* Mobile: html,body{overflow-x:hidden} forces overflow-y to clip, which
             cuts the badge's desktop top:-10px poke past the rounded corner. Tuck
             the badge fully inside the card and reserve top padding so it never
             overlaps the corner or the avatar. Desktop layout is unchanged. */
          .drc-card-hl { padding-top: 28px; }
          .drc-badge { top: 6px; left: 12px; }
        }
      `}</style>
    </article>
  )
}
