// SECTION 7 — Treatments & fees. Each row deep-links into the booking flow
// with the treatment pre-selected. We pass the treatment NAME (not slug) in
// ?treatment= because the booking page matches on name.trim().toLowerCase()
// (src/app/book/[slug]/page.tsx) — passing a slug would silently fail to
// pre-select. TrackedBookingLink fires the same booking_click event as the
// primary CTAs. Caller hides the section when there are no treatments.

import TrackedBookingLink from './TrackedBookingLink'
import { NAVY, TEAL_DARK } from './profileTheme'

interface Treatment {
  id: string | number
  name: string
  slug?: string | null
  icon?: string | null
}
interface DentistTreatment {
  fee_from: number | null
  fee_to: number | null
  treatments: Treatment | null
}

interface Props {
  treatments: DentistTreatment[]
  dentistId: string
  slug: string
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

function formatFee(from: number | null, to: number | null): string {
  if (from && to) return from === to ? inr(from) : `${inr(from)}–${to.toLocaleString('en-IN')}`
  if (from) return `From ${inr(from)}`
  if (to) return `Up to ${inr(to)}`
  return ''
}

export default function TreatmentsList({ treatments, dentistId, slug }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {treatments.map(dt => {
        const t = dt.treatments
        if (!t) return null
        const fee = formatFee(dt.fee_from, dt.fee_to)
        return (
          <TrackedBookingLink
            key={t.id}
            dentistId={dentistId}
            href={`/book/${slug}?treatment=${encodeURIComponent(t.name)}`}
            className="profile-treatment-row"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {t.icon && <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{t.icon}</span>}
              <span style={{ fontWeight: 600, fontSize: 15, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              {fee && <span style={{ fontSize: 14, color: TEAL_DARK, fontWeight: 700, whiteSpace: 'nowrap' }}>{fee}</span>}
              <span className="profile-treatment-cta" aria-hidden>Book →</span>
            </div>
          </TrackedBookingLink>
        )
      })}
    </div>
  )
}
