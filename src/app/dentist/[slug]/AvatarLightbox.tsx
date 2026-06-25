'use client'

// The dentist's profile photo (the overlapping identity avatar). When a photo
// exists, tapping it opens the fullscreen PhotoLightbox with that single image
// (no navigation arrows). When there's no photo, it renders the navy→teal
// gradient with initials and is NOT interactive. Keeps the `.profile-avatar`
// class so the layout CSS in page.tsx still sizes/positions it.

import { useState } from 'react'
import { BRAND_GRADIENT, initialsFrom } from './profileTheme'
import PhotoLightbox from './PhotoLightbox'

interface Props {
  /** Delivery-optimised profile photo URL, or null when none. */
  photo: string | null
  /** Dentist name — used for the initials fallback. */
  name: string
}

export default function AvatarLightbox({ photo, name }: Props) {
  const [open, setOpen] = useState(false)

  if (!photo) {
    return (
      <div className="profile-avatar" style={{ background: BRAND_GRADIENT }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 26, fontFamily: 'var(--font-heading)' }}>{initialsFrom(name)}</span>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="View profile photo"
        onClick={() => setOpen(true)}
        className="profile-avatar"
        style={{ background: `url(${photo}) center/cover`, padding: 0, cursor: 'zoom-in' }}
      />
      {open && (
        <PhotoLightbox photos={[{ url: photo }]} initialIndex={0} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
