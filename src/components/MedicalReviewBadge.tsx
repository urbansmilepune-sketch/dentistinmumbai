// Reusable "Medically reviewed by …" badge for treatment/content pages.
//
// E-E-A-T signal: renders the reviewing clinician's name (linked to their
// author page), credentials, council registration, and the last-reviewed
// date in one compact, consistent strip. Server component — presentational
// only, inline styles per the project's no-Tailwind/no-new-CSS constraint.
//
// Used on /treatment/root-canal and intended for every future medically
// reviewed treatment page so the byline stays identical site-wide.
import Link from 'next/link'
import { NAVY, TEAL, TEAL_SOFT } from '@/app/dentist/[slug]/profileTheme'

interface Props {
  /** Reviewer display name, e.g. "Dr. Manish Dighade". */
  name: string
  /** Post-nominal credentials, e.g. "BDS, Fellowship in Dental Implantology". */
  credentials: string
  /** Council registration string, e.g. "MSDC Reg. A-24630". */
  registration: string
  /** Link to the reviewer's author page (internal path or absolute URL). */
  profileUrl: string
  /** Human-readable last-reviewed date, e.g. "July 2026". */
  reviewDate: string
}

export default function MedicalReviewBadge({ name, credentials, registration, profileUrl, reviewDate }: Props) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 14px', background: TEAL_SOFT,
        border: '1px solid #99F6E4', borderRadius: 10,
        fontSize: 13.5, lineHeight: 1.5, color: NAVY,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0, width: 20, height: 20, marginTop: 1, borderRadius: '50%',
          background: TEAL, color: '#fff', fontSize: 12, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✓</span>
      <span>
        Medically reviewed by{' '}
        <Link href={profileUrl} style={{ color: TEAL, fontWeight: 700 }}>
          {name}, {credentials}
        </Link>
        {' — '}{registration} · Last reviewed {reviewDate}
      </span>
    </div>
  )
}
