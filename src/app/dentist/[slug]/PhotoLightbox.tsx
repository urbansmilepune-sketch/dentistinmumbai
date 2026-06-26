'use client'

// Fullscreen photo lightbox for the dentist profile — used for both the
// clinic gallery (multiple photos, swipe + arrows) and the single profile
// photo (no navigation). No external libraries: just useState/useEffect.
//
// The parent owns open/closed state and renders this only while open; this
// component owns the current index, keyboard/swipe navigation, and the
// body-scroll lock.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface LightboxPhoto {
  url: string
  caption?: string | null
}

interface Props {
  photos: LightboxPhoto[]
  initialIndex: number
  onClose: () => void
}

export default function PhotoLightbox({ photos, initialIndex, onClose }: Props) {
  const count = photos.length
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(count - 1, 0)))
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const multi = count > 1

  const prev = useCallback(() => setIndex(i => (i - 1 + count) % count), [count])
  const next = useCallback(() => setIndex(i => (i + 1) % count), [count])

  // Lock body scroll while open; restore on unmount.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  // Keyboard: Escape closes, arrows navigate (when multiple).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (multi && e.key === 'ArrowLeft') prev()
      else if (multi && e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [multi, prev, next, onClose])

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = (t?.clientX ?? start.x) - start.x
    const dy = (t?.clientY ?? start.y) - start.y
    // Downward swipe closes (when the gesture is clearly vertical).
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { onClose(); return }
    // Horizontal swipe navigates the gallery.
    if (multi && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev()
    }
  }

  const photo = photos[index]
  if (!photo) return null

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'pan-y',
      }}
    >
      {/* Photo counter — top center */}
      {multi && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          color: '#fff', fontSize: 14, fontWeight: 600, letterSpacing: '0.02em',
          background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '6px 14px',
        }}>
          {index + 1} of {count}
        </div>
      )}

      {/* Close button — top right */}
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => { stop(e); onClose() }}
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 10,
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(255,255,255,0.14)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      {/* Prev/next arrow chips. Kept compact (not full-height tap areas) so a
          tap on the dark background still falls through to the overlay's
          onClick={onClose}; mobile users navigate by horizontal swipe. */}
      {multi && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => { stop(e); prev() }}
            style={{ ...navBtnStyle, left: 12 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => { stop(e); next() }}
            style={{ ...navBtnStyle, right: 12 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}

      {/* The image — click stops propagation for galleries; for a single
          photo, clicking it closes (matches the profile-photo zoom UX). */}
      <img
        src={photo.url}
        alt={photo.caption || 'Photo'}
        onClick={multi ? stop : onClose}
        style={{
          maxWidth: '100vw', maxHeight: '90vh', objectFit: 'contain',
          display: 'block', userSelect: 'none', position: 'relative', zIndex: 1,
        }}
      />

      {/* Caption — bottom center */}
      {photo.caption && (
        <div
          onClick={stop}
          style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            maxWidth: 'min(90vw, 640px)', textAlign: 'center',
            color: 'rgba(255,255,255,0.92)', fontSize: 14, lineHeight: 1.5,
            background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: '8px 14px', zIndex: 2,
          }}
        >
          {photo.caption}
        </div>
      )}
    </div>
  )
}

// Compact left/right arrow chips, vertically centered. Sized to the chip only
// (not a full-height column) so the surrounding dark area remains background
// that closes the lightbox on tap. zIndex below the close button (10) so the
// X in the top-right corner always wins the hit test.
const navBtnStyle: React.CSSProperties = {
  position: 'fixed', top: '50%', transform: 'translateY(-50%)', zIndex: 3,
  width: 44, height: 44, borderRadius: '50%',
  background: 'rgba(255,255,255,0.14)', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
