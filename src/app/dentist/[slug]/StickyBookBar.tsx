// SECTION 11 — Sticky mobile book bar (+ the contextual closed nudge that
// sits directly above it). Mobile-only: on desktop the hero CTAs and the
// floating ClinicContactButton already cover this, so the whole dock hides
// at ≥769px — matching the previous sticky bar's behaviour.
//
// Layout: Call (icon-only, compact square) · WhatsApp (icon-only, compact
// green square) · Book appointment (teal, takes the remaining width, with
// label). All 56px tall, evenly gapped, rounded, with a subtle top shadow
// and an iPhone safe-area inset on the dock.
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
        <Link href={`/area/${closedNudge.areaSlug}?open=true`} className="profile-closed-nudge">
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
          <span>{closedNudge.drName} is closed now — see dentists open in {closedNudge.areaName} →</span>
        </Link>
      )}

      <div className="profile-sticky-row">
        {phone && (
          <TrackedLink
            dentistId={dentistId}
            eventType="call_click"
            href={`tel:${phone}`}
            aria-label="Call clinic"
            className="profile-dock-btn profile-dock-icon"
            style={{ background: '#fff', color: NAVY, border: `2px solid ${NAVY}` }}>
            <PhoneIcon size={20} color={NAVY} />
          </TrackedLink>
        )}
        {waUrl && (
          <TrackedLink
            dentistId={dentistId}
            eventType="whatsapp_click"
            href={waUrl}
            target="_blank" rel="noopener noreferrer"
            aria-label="WhatsApp clinic"
            className="profile-dock-btn profile-dock-icon"
            style={{ background: WHATSAPP, color: '#fff' }}>
            <WhatsAppIcon size={22} color="#fff" />
          </TrackedLink>
        )}
        <TrackedBookingLink
          dentistId={dentistId}
          href={`/book/${slug}`}
          className="profile-dock-btn profile-dock-book"
          style={{ background: TEAL, color: '#fff' }}>
          <CalendarIcon size={19} color="#fff" />
          Book appointment
        </TrackedBookingLink>
      </div>

      <style>{`
        .profile-bottom-dock {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
          display: none; flex-direction: column;
          background: #fff;
          border-top: 1px solid var(--border);
          box-shadow: 0 -2px 14px rgba(15,23,42,0.10);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .profile-closed-nudge {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px;
          background: #FFFBEB; border-bottom: 1px solid #FDE68A;
          color: #92400E; font-size: 12.5px; font-weight: 600;
          text-decoration: none; line-height: 1.35;
        }
        .profile-sticky-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
        }
        .profile-dock-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          height: 56px; border-radius: 14px;
          font-weight: 700; font-size: 15px; text-decoration: none;
          box-sizing: border-box;
        }
        .profile-dock-btn:active { transform: translateY(1px); }
        .profile-dock-icon { flex: 0 0 56px; width: 56px; padding: 0; }
        .profile-dock-book { flex: 1; padding: 0 12px; }
        @media (max-width: 768px) {
          .profile-bottom-dock { display: flex; }
        }
      `}</style>
    </div>
  )
}
