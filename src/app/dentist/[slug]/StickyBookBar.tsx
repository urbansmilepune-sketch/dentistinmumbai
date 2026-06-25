// SECTION 11 — Sticky mobile book bar (+ the contextual closed nudge that
// sits directly above it). Mobile-only: on desktop the hero CTAs and the
// floating ClinicContactButton already cover this, so the whole dock hides
// at ≥769px — matching the previous sticky bar's behaviour.
//
// The closed nudge renders ONLY when `closedNudge` is passed (the page passes
// it solely when the dentist is closed right now), and links to the area
// page's open-now filter. Note: that page reads `?open=true` (not the spec's
// literal `?open=now`) — we use the value that actually triggers the filter.

import Link from 'next/link'
import TrackedLink from './TrackedLink'
import TrackedBookingLink from './TrackedBookingLink'
import { NAVY, TEAL, WHATSAPP } from './profileTheme'
import { PhoneIcon, WhatsAppIcon, CalendarIcon } from './profileIcons'

interface ClosedNudge { drName: string; areaSlug: string; areaName: string }

interface Props {
  dentistId: string
  slug: string
  waUrl: string | null
  phone: string | null
  closedNudge: ClosedNudge | null
}

export default function StickyBookBar({ dentistId, slug, waUrl, phone, closedNudge }: Props) {
  return (
    <div className="profile-bottom-dock">
      {closedNudge && (
        <Link
          href={`/area/${closedNudge.areaSlug}?open=true`}
          className="profile-closed-nudge"
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
          {closedNudge.drName} is closed now — see dentists open in {closedNudge.areaName} →
        </Link>
      )}

      <div className="profile-sticky-row">
        {phone && (
          <TrackedLink
            dentistId={dentistId}
            eventType="call_click"
            href={`tel:${phone}`}
            aria-label="Call clinic"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, width: 52, flexShrink: 0, background: '#fff', color: NAVY, border: `2px solid ${NAVY}`, borderRadius: 12, textDecoration: 'none' }}>
            <PhoneIcon size={20} color={NAVY} />
          </TrackedLink>
        )}
        {waUrl && (
          <TrackedLink
            dentistId={dentistId}
            eventType="whatsapp_click"
            href={waUrl}
            target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 52, padding: '0 8px', background: WHATSAPP, color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            <WhatsAppIcon size={18} color="#fff" /> WhatsApp
          </TrackedLink>
        )}
        <TrackedBookingLink
          dentistId={dentistId}
          href={`/book/${slug}`}
          style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 52, padding: '0 8px', background: TEAL, color: '#fff', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          <CalendarIcon size={18} color="#fff" /> Book appointment
        </TrackedBookingLink>
      </div>

      <style>{`
        .profile-bottom-dock {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
          display: none; flex-direction: column;
          background: #fff; border-top: 1px solid var(--border);
          box-shadow: 0 -4px 16px rgba(15,23,42,0.08);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .profile-closed-nudge {
          display: flex; align-items: center; gap: 8;
          padding: 9px 14px;
          background: #FFFBEB; border-bottom: 1px solid #FDE68A;
          color: #92400E; font-size: 12.5px; font-weight: 600;
          text-decoration: none; line-height: 1.35;
        }
        .profile-sticky-row { display: flex; gap: 8; padding: 10px 12px; }
        @media (max-width: 768px) {
          .profile-bottom-dock { display: flex; }
        }
      `}</style>
    </div>
  )
}
