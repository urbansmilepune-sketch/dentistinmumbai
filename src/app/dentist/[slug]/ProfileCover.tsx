'use client'

// SECTION 1 — Cover + photos.
//
// Three states, all designed to look intentional (≈70% of profiles ship with
// no photos at all):
//   • gallery photos exist  → a collage (1 / 2 / 3+ layouts) with a
//     "N clinic photos" badge bottom-right.
//   • no gallery but a cover_photo exists → that single image, full-bleed.
//   • nothing                → navy→teal gradient with the clinic name
//     centred. Never an empty/broken box.
//
// Client component: tapping any photo opens the fullscreen PhotoLightbox at
// that index. The collage only renders up to 3 tiles, but the lightbox
// navigates the FULL gallery.

import { useState } from 'react'
import { BRAND_GRADIENT, NAVY } from './profileTheme'
import { CameraIcon } from './profileIcons'
import PhotoLightbox from './PhotoLightbox'

interface Photo { url: string; caption?: string | null }

interface Props {
  photos: Photo[]
  coverPhoto: string | null
  clinicName: string
}

function Badge({ count }: { count: number }) {
  return (
    <div style={{
      position: 'absolute', right: 12, bottom: 12, zIndex: 2,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 11px', borderRadius: 999,
      background: 'rgba(15,23,42,0.72)', color: '#fff',
      fontSize: 12, fontWeight: 700, backdropFilter: 'blur(4px)',
      pointerEvents: 'none',
    }}>
      <CameraIcon size={14} color="#fff" />
      {count} clinic {count === 1 ? 'photo' : 'photos'}
    </div>
  )
}

const imgStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }

export default function ProfileCover({ photos, coverPhoto, clinicName }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Photos the lightbox navigates: the full gallery, or the single cover.
  const lightboxPhotos: Photo[] = photos.length > 0
    ? photos
    : coverPhoto ? [{ url: coverPhoto, caption: `${clinicName} clinic` }] : []

  const open = (i: number) => setLightboxIndex(i)
  const close = () => setLightboxIndex(null)

  const lightbox = lightboxIndex !== null && lightboxPhotos.length > 0 && (
    <PhotoLightbox photos={lightboxPhotos} initialIndex={lightboxIndex} onClose={close} />
  )

  // --- State A: collage from gallery photos ---
  if (photos.length > 0) {
    const n = photos.length
    return (
      <div className="profile-cover-wrap" style={{ position: 'relative', width: '100%', overflow: 'hidden', background: NAVY }}>
        {n === 1 && (
          <div className="profile-cover-collage profile-cover-single">
            <img src={photos[0].url} alt={photos[0].caption || `${clinicName} clinic photo`} style={imgStyle} onClick={() => open(0)} />
          </div>
        )}
        {n === 2 && (
          <div className="profile-cover-collage profile-cover-two">
            {photos.slice(0, 2).map((p, i) => (
              <img key={i} src={p.url} alt={p.caption || `${clinicName} clinic photo`} style={imgStyle} onClick={() => open(i)} />
            ))}
          </div>
        )}
        {n >= 3 && (
          <div className="profile-cover-collage profile-cover-grid">
            <img className="profile-cover-hero" src={photos[0].url} alt={photos[0].caption || `${clinicName} clinic photo`} style={imgStyle} onClick={() => open(0)} />
            <img src={photos[1].url} alt={photos[1].caption || `${clinicName} clinic photo`} style={imgStyle} onClick={() => open(1)} />
            <img src={photos[2].url} alt={photos[2].caption || `${clinicName} clinic photo`} style={imgStyle} onClick={() => open(2)} />
          </div>
        )}
        <Badge count={n} />
        {/* Bottom scrim so the overlapping identity card always has contrast. */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0) 55%, rgba(15,23,42,0.28) 100%)', pointerEvents: 'none' }} />
        {lightbox}
      </div>
    )
  }

  // --- State B: single cover photo, no gallery ---
  if (coverPhoto) {
    return (
      <div className="profile-cover-wrap" style={{ position: 'relative', width: '100%', overflow: 'hidden', background: NAVY }}>
        <div className="profile-cover-collage profile-cover-single">
          <img src={coverPhoto} alt={`${clinicName} clinic`} style={imgStyle} onClick={() => open(0)} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0) 55%, rgba(15,23,42,0.28) 100%)', pointerEvents: 'none' }} />
        {lightbox}
      </div>
    )
  }

  // --- State C: no photos at all → intentional branded gradient ---
  return (
    <div className="profile-cover-wrap profile-cover-empty" style={{
      position: 'relative', width: '100%', overflow: 'hidden',
      background: BRAND_GRADIENT,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <span style={{
        color: '#fff', textAlign: 'center', fontFamily: 'var(--font-heading)',
        fontWeight: 800, fontSize: 22, lineHeight: 1.3, letterSpacing: '-0.01em',
        textShadow: '0 1px 2px rgba(0,0,0,0.18)', maxWidth: 480,
      }}>
        {clinicName}
      </span>
    </div>
  )
}
