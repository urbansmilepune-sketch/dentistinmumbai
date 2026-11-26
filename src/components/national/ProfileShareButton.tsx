'use client'

// Share button for an expert profile on dentistinindia.in. The owner gets
// the filled "Share my profile" button; visitors get a plain "Share".
// The preview picture is the profile share card (/api/og/profile/<slug>).
// Shares are logged as profile_share against the profile's dentist.

import { NATIONAL_ORIGIN } from '@/config/cities'
import { drName } from '@/lib/dentistName'
import ShareMenu from './ShareMenu'

interface Props {
  slug: string
  name: string
  dentistId: string
  isOwner: boolean
}

export default function ProfileShareButton({ slug, name, dentistId, isOwner }: Props) {
  const url = `${NATIONAL_ORIGIN}/professional/${slug}`
  const who = drName(name)
  const whatsappText = isOwner
    ? `My profile on DentistIn India, with the cases I've shared and checked after treatment:\n${url}`
    : `${who} on DentistIn India:\n${url}`

  function track() {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dentist_id: dentistId, event_type: 'profile_share' }),
    }).catch(() => {})
  }

  return (
    <ShareMenu
      url={url}
      whatsappText={whatsappText}
      tweetText={`${who} on DentistIn India`}
      storyImageUrl={`/api/og/profile/${slug}?format=story`}
      storyFileName={`dentistin-${slug}.png`}
      label={isOwner ? 'Share my profile' : '↗ Share'}
      title={isOwner ? 'Share my profile' : 'Share this profile'}
      primary={isOwner}
      onShare={track}
    />
  )
}
