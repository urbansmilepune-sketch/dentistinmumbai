'use client'

import { useState } from 'react'

interface Photo {
  id: string
  url: string
  category: string
  caption: string | null
}

interface GalleryTabProps {
  photos: Photo[]
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'interior', label: 'Interior' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'team', label: 'Team' },
  { id: 'before_after', label: 'Before & After' },
]

export default function GalleryTab({ photos }: GalleryTabProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const filtered = activeCategory === 'all' ? photos : photos.filter(p => p.category === activeCategory)

  function openLightbox(index: number) { setLightboxIndex(index) }
  function closeLightbox() { setLightboxIndex(null) }
  function prev() { setLightboxIndex(i => i !== null ? Math.max(0, i - 1) : null) }
  function next() { setLightboxIndex(i => i !== null ? Math.min(filtered.length - 1, i + 1) : null) }

  if (photos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🖼️</div>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No photos yet</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>This clinic hasn't added photos yet.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {CATEGORIES.map(cat => {
          const count = cat.id === 'all' ? photos.length : photos.filter(p => p.category === cat.id).length
          if (count === 0 && cat.id !== 'all') return null
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                border: `2px solid ${activeCategory === cat.id ? 'var(--blue)' : 'var(--border)'}`,
                background: activeCategory === cat.id ? 'var(--blue)' : '#fff',
                color: activeCategory === cat.id ? '#fff' : 'var(--text)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >{cat.label} {count > 0 && `(${count})`}</button>
          )
        })}
      </div>

      {/* Photo grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg)', borderRadius: 12, border: '1px dashed var(--border)' }}>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No photos in this category yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {filtered.map((photo, i) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(i)}
              style={{
                aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden',
                cursor: 'pointer', background: 'var(--blue-light)',
                border: '1px solid var(--border)', position: 'relative',
              }}
            >
              <img
                src={photo.url} alt={photo.caption || photo.category}
                style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              />
              {photo.caption && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  padding: '8px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                  color: '#fff', fontSize: 11, fontWeight: 500,
                }}>{photo.caption}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && filtered[lightboxIndex] && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeLightbox}
        >
          <button onClick={e => { e.stopPropagation(); prev() }} disabled={lightboxIndex === 0} style={{
            position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
            width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 20, border: 'none', cursor: 'pointer',
            opacity: lightboxIndex === 0 ? 0.3 : 1,
          }}>‹</button>

          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '85vw', maxHeight: '85vh', position: 'relative' }}>
            <img
              src={filtered[lightboxIndex].url}
              alt={filtered[lightboxIndex].caption || ''}
              style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12 }}
            />
            {filtered[lightboxIndex].caption && (
              <p style={{ color: '#fff', textAlign: 'center', marginTop: 12, fontSize: 14 }}>{filtered[lightboxIndex].caption}</p>
            )}
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 }}>
              {lightboxIndex + 1} / {filtered.length}
            </div>
          </div>

          <button onClick={e => { e.stopPropagation(); next() }} disabled={lightboxIndex === filtered.length - 1} style={{
            position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
            width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 20, border: 'none', cursor: 'pointer',
            opacity: lightboxIndex === filtered.length - 1 ? 0.3 : 1,
          }}>›</button>

          <button onClick={closeLightbox} style={{
            position: 'absolute', top: 20, right: 20,
            width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 18, border: 'none', cursor: 'pointer',
          }}>✕</button>
        </div>
      )}
    </div>
  )
}
