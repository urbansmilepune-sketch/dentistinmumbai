'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { effectiveTier, tierMeets, type Tier } from '@/lib/tier'

// Gallery-tile budget per tier. The Cloudinary upload happens server-side
// so this gate also needs a server-side mirror in /api/cloudinary/upload to
// be authoritative — for now this is the UX-level limit only.
const GALLERY_LIMIT: Record<Tier, number> = {
  free: 5, silver: 20, gold: 20, featured: 20,
}

type PhotoType = 'profile' | 'cover' | 'gallery'

interface Photo {
  id: string
  url: string
  caption: string | null
  category: string
}

// Gallery sections rendered on this page. Keys must match the
// GALLERY_CATEGORIES whitelist in /api/cloudinary/upload — adding a section
// here without updating the API will make uploads 400.
const SECTIONS: Array<{ key: string; label: string; desc: string; optional?: boolean }> = [
  { key: 'interior',       label: 'Clinic Interior',         desc: 'Reception, waiting area, treatment rooms' },
  { key: 'exterior',       label: 'Clinic Exterior',         desc: 'Front of clinic, signage, entrance' },
  { key: 'team',           label: 'Team & Faculty',          desc: 'Dentist + staff photos' },
  { key: 'equipment',      label: 'Equipment & Instruments', desc: 'Chairs, X-ray machines, sterilization' },
  { key: 'certifications', label: 'Certifications & Awards', desc: 'Degrees, certificates, recognitions' },
  { key: 'before_after',   label: 'Before & After Cases',    desc: 'Clinical result photos', optional: true },
]
const SECTION_KEYS = new Set(SECTIONS.map(s => s.key))

export default function PhotosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null)
  const [gallery, setGallery] = useState<Photo[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [tier, setTier] = useState<Tier>('free')

  const profileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, profile_photo, cover_photo, tier, trial_started_at')
        .eq('email', user.email)
        .single()

      if (dentist) {
        setDentistId(dentist.id)
        setProfilePhoto(dentist.profile_photo)
        setCoverPhoto(dentist.cover_photo)
        setTier(effectiveTier(dentist.tier, dentist.trial_started_at))

        const { data: photos } = await supabase
          .from('gallery_photos')
          .select('*')
          .eq('dentist_id', dentist.id)
          .order('created_at', { ascending: false })

        setGallery(photos || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // For gallery uploads, `category` picks which dentist photos section the
  // new row lands in. Profile/cover ignore it.
  async function uploadFile(file: File, type: PhotoType, category?: string) {
    if (file.size > 10 * 1024 * 1024) { setError('File too large. Max 10MB.'); return }
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return }

    // Uploading state key — gallery uploads carry their category so each
    // section's spinner only spins for its own in-flight upload.
    const stateKey = type === 'gallery' && category ? `gallery:${category}` : type
    setUploading(stateKey); setError('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    if (type === 'gallery' && category) formData.append('category', category)

    try {
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!data.success) { setError(data.error || 'Upload failed'); setUploading(null); return }

      if (type === 'profile') setProfilePhoto(data.url)
      else if (type === 'cover') setCoverPhoto(data.url)
      else if (data.photo) {
        // The API now returns the inserted gallery_photos row directly,
        // so we can prepend it without a racy "fetch the newest row"
        // re-query that mis-attributes back-to-back uploads.
        setGallery(prev => [data.photo as Photo, ...prev])
      }
    } catch { setError('Upload failed. Please try again.') }
    setUploading(null)
  }

  async function deletePhoto(photoId: string) {
    const supabase = createClient()
    await supabase.from('gallery_photos').delete().eq('id', photoId)
    setGallery(prev => prev.filter(p => p.id !== photoId))
  }

  const UploadZone = ({ type, current, inputRef, label, hint }: { type: PhotoType; current: string | null; inputRef: React.RefObject<HTMLInputElement | null>; label: string; hint: string }) => (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{label}</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{hint}</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {current && (
          // Profile thumbnails stay round; cover/gallery thumbnails use a
          // 160×60 landscape tile with borderRadius:8 per the audit spec.
          // objectPosition:center + display:block prevent the iframe-style
          // inline-image baseline gap and keep the focal point of a wide
          // banner photo centered inside the cropped thumbnail.
          <div style={{
            width: type === 'profile' ? 80 : 160,
            height: type === 'profile' ? 80 : 60,
            borderRadius: type === 'profile' ? '50%' : 8,
            overflow: 'hidden',
            border: '2px solid var(--border)',
            flexShrink: 0,
          }}>
            <img
              src={current}
              alt={label}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                display: 'block',
              }}
            />
          </div>
        )}
        <div
          onClick={() => inputRef.current?.click()}
          style={{ flex: 1, minHeight: 80, border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '16px', background: 'var(--bg)', transition: 'border-color 0.2s' }}
        >
          {uploading === type ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, border: '3px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Uploading...</span>
            </div>
          ) : (
            <>
              <span style={{ fontSize: 28, marginBottom: 8 }}>📤</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{current ? 'Change Photo' : 'Upload Photo'}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>JPG, PNG, WebP · Max 10MB</span>
            </>
          )}
        </div>
      </div>
      <input ref={inputRef as any} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const file = e.target.files?.[0]; if (file) uploadFile(file, type) }} />
    </div>
  )

  // One categorized gallery section — owns its own hidden file input so we
  // can route uploads to the correct gallery_photos.category without
  // tracking "which section was clicked" in component state.
  const CategorySection = ({ section, photos, atTotalLimit }: { section: typeof SECTIONS[number]; photos: Photo[]; atTotalLimit: boolean }) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const stateKey = `gallery:${section.key}`
    const isUploading = uploading === stateKey
    const triggerPick = () => { if (!atTotalLimit && !isUploading) inputRef.current?.click() }

    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
            {section.label}
            {section.optional && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>(optional)</span>}
          </h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{section.desc}</p>

        {photos.length === 0 ? (
          // Empty state — full-width dropzone prompts the dentist to add the
          // first photo for this category.
          <div
            onClick={triggerPick}
            style={{
              minHeight: 140, border: '2px dashed var(--border)', borderRadius: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: atTotalLimit ? 'not-allowed' : 'pointer', padding: '24px', background: 'var(--bg)', gap: 6,
              opacity: atTotalLimit ? 0.5 : 1,
            }}
          >
            {isUploading ? (
              <>
                <div style={{ width: 32, height: 32, border: '3px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Uploading…</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 28 }}>📤</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>Add {section.label}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>JPG, PNG, WebP · Max 10MB</span>
              </>
            )}
          </div>
        ) : (
          // Photo grid — uploaded tiles + an inline add tile (until total limit hit).
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {!atTotalLimit && (
              <div
                onClick={triggerPick}
                style={{ aspectRatio: '1', border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--bg)', gap: 6 }}
              >
                {isUploading ? (
                  <div style={{ width: 28, height: 28, border: '3px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>
                    <span style={{ fontSize: 28 }}>+</span>
                    <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>Add Photo</span>
                  </>
                )}
              </div>
            )}
            {photos.map(photo => (
              <div key={photo.id} style={{ aspectRatio: '1', borderRadius: 12, overflow: 'hidden', position: 'relative', border: '1px solid var(--border)' }}>
                <img src={photo.url} alt={photo.caption || section.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => deletePhoto(photo.id)}
                  style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) uploadFile(file, 'gallery', section.key)
            // Reset so re-selecting the same file fires onChange again.
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  // Bucket photos by category — xray rows and any unknown values are filtered
  // out so a stray category in the DB doesn't silently vanish from the UI.
  const photosBySection = new Map<string, Photo[]>()
  for (const s of SECTIONS) photosBySection.set(s.key, [])
  for (const p of gallery) {
    if (SECTION_KEYS.has(p.category)) photosBySection.get(p.category)!.push(p)
  }
  const visibleGalleryCount = Array.from(photosBySection.values()).reduce((n, arr) => n + arr.length, 0)
  const atTotalLimit = visibleGalleryCount >= GALLERY_LIMIT[tier]

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Photos & Gallery</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Clinics with photos get 3x more enquiries. Upload at least 5 photos.</p>
      </div>

      {error && <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <UploadZone type="profile" current={profilePhoto} inputRef={profileRef} label="Profile Photo" hint="Your headshot. 400×400px recommended. This appears on your listing card." />
        <div>
          <UploadZone
            type="cover"
            current={coverPhoto}
            inputRef={coverRef}
            label="Cover Photo"
            hint="Clinic banner photo. Recommended size: 1200×400px (landscape/wide format). Use a high-quality photo of your clinic exterior, reception area, or treatment room. Avoid portrait/vertical photos — they will appear cropped. Minimum width: 800px for best quality."
          />
          {/* Visual aspect-ratio guide — the cover renders at 3:1 on the public
              profile, so portrait uploads get heavily cropped. Showing a 3:1
              rectangle makes that constraint obvious before upload. */}
          <div style={{
            marginTop: 12,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '16px 18px',
          }}>
            <div style={{
              width: '100%',
              aspectRatio: '3 / 1',
              background: 'linear-gradient(135deg, #BFDBFE 0%, #DBEAFE 100%)',
              border: '2px dashed #93C5FD',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              color: 'var(--blue-dark)',
              fontWeight: 700,
              fontSize: 13,
            }}>
              1200 × 400 · 3 : 1
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div>📐 Ideal ratio: 3:1 (wide landscape like a Facebook cover photo)</div>
              <div>✅ Good: clinic exterior, reception, team photo</div>
              <div>❌ Avoid: portrait shots, selfies, small images</div>
            </div>
          </div>
        </div>

        {/* Categorized clinic gallery — one section per photo type. The total
            count across all sections counts toward the tier's GALLERY_LIMIT;
            individual sections do not have their own caps. The divider here
            visually breaks Profile/Cover (identity photos) from the clinic
            gallery (location/team photos) so the page reads as two groups. */}
        <div style={{ marginTop: 12 }}>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '0 0 16px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, marginBottom: 2 }}>Clinic Photos</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Show patients what your clinic and team look like across six categories.</p>
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{visibleGalleryCount} / {GALLERY_LIMIT[tier]} photos</span>
          </div>
        </div>

        {!tierMeets(tier, 'silver') && visibleGalleryCount >= GALLERY_LIMIT.free && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#FEF3C7', border: '1px solid #FDE68A',
            borderRadius: 10, padding: '12px 14px',
            fontSize: 13, color: '#92400E', flexWrap: 'wrap',
          }}>
            <span>🔒 Free plan caps the gallery at <strong>{GALLERY_LIMIT.free}</strong> photos across all sections.</span>
            <a href="/for-dentists/dashboard/upgrade"
              style={{ color: 'var(--blue)', fontWeight: 700, textDecoration: 'none', marginLeft: 'auto' }}>
              Upgrade for {GALLERY_LIMIT.silver} photos →
            </a>
          </div>
        )}

        {SECTIONS.map(section => (
          <CategorySection
            key={section.key}
            section={section}
            photos={photosBySection.get(section.key) || []}
            atTotalLimit={atTotalLimit}
          />
        ))}

        {/* Tips */}
        <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 16, padding: '20px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📸 Photo Tips</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--blue-dark)' }}>
            <div>✅ Upload a clear, professional headshot as your profile photo</div>
            <div>✅ Show the clinic reception, treatment room, and equipment</div>
            <div>✅ Before/after photos for cosmetic treatments boost enquiries</div>
            <div>✅ Well-lit, high-quality photos build more trust with patients</div>
            <div>✅ Aim for at least 5 photos for a complete profile</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
