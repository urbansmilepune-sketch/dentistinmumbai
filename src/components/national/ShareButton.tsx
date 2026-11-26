'use client'

// Per-case share button. Always shares the national URL
// (https://dentistinindia.in/cases/<readable-slug>) regardless of which surface the
// button is rendered on, so the preview resolves on the canonical host.
// The preview picture is the case share card (/api/og/case/<slug>): title,
// specialty, city and dentist name, never a clinical photo.
//
// Variants:
//   - default ("↗ Share" pill) — used on /cases/[id] in the social-actions row
//   - compact (icon button)    — for card corners alongside SaveButton
//
// Shares fire-and-forget POST to /api/analytics/track with
// event_type='case_share' attributed to the case author's dentist_id. The
// sharer themselves isn't tracked — privacy + we just want amplification
// signal for the author.

import { NATIONAL_ORIGIN } from '@/config/cities'
import { drName } from '@/lib/dentistName'
import { caseSlug } from '@/lib/caseSlug'
import ShareMenu from './ShareMenu'

interface Props {
  caseId: string
  caseTitle: string
  dentistName: string
  /** Author's city, used in the readable case link. */
  caseCity?: string | null
  /** Case author's dentist_id — analytics attribution lands here. */
  dentistId?: string | null
  compact?: boolean
}

export default function ShareButton({ caseId, caseTitle, dentistName, caseCity, dentistId, compact = false }: Props) {
  const slug = caseSlug({ id: caseId, title: caseTitle, city: caseCity })
  const url = `${NATIONAL_ORIGIN}/cases/${slug}`
  const who = dentistName ? drName(dentistName) : 'a verified dentist'

  function track() {
    if (!dentistId) return
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'case_share' }),
    }).catch(() => {})
  }

  return (
    <ShareMenu
      url={url}
      whatsappText={`Check out this clinical case by ${who} on DentistIn India 🦷\n${caseTitle}\n${url}`}
      tweetText={`Interesting dental case by ${who} on DentistIn India`}
      storyImageUrl={`/api/og/case/${slug}?format=story`}
      storyFileName={`dentistin-case-${slug.slice(-8)}.png`}
      title="Share this case"
      compact={compact}
      onShare={track}
    />
  )
}
