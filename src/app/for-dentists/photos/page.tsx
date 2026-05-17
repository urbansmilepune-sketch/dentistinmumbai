'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type PhotoType = 'profile' | 'cover' | 'gallery'

interface Photo {
  id: string
  url: string
  caption: string | null
  category: string
}

export default function PhotosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dentistId, setDentistId] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null)
  const [gallery, setGallery] = useState<Photo[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const profileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, profile_photo, cover_photo')
        .eq('email', user.email)
        .single()

      if (dentist) {
        setDentistId(dentist.id)
        setProfilePhoto(dentist.profile_photo)
        setCoverPhoto(dentist.cover_photo)

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

  async function uploadFile(file: File, type: PhotoType) {
    if (file.size > 10 * 1024 * 1024) { setError('File too large. Max 10MB.'); return }
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return }

    setUploading(type); setError('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    try {
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!data.success) { setError(data.error || 'Upload failed'); setUploading(null); return }

      if (type === 'profile') setProfilePhoto(data.url)
      else if (type === 'cover') setCoverPhoto(data.url)
      else if (data.photo) {
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
          <div style={{ width: type === 'profile' ? 80 : 160, height: type === 'profile' ? 80 : 60, borderRadius: type === 'profile' ? '50%' : 10, overflow: 'hidden', border: '2px solid var(--border)', flexShrink: 0 }}>
            <img src={current} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Photos & Gallery</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Clinics with photos get 3x more enquiries. Upload at least 5 photos.</p>
      </div>

      {error && <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <UploadZone type="profile" current={profilePhoto} inputRef={profileRef} label="Profile Photo" hint="Your headshot. 400×400px recommended. This appears on your listing card." />
        <UploadZone type="cover" current={coverPhoto} inputRef={coverRef} label="Cover Photo" hint="Clinic banner. 1200×300px recommended. Appears at the top of your profile." />

        {/* Gallery */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Clinic Gallery</h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{gallery.length} / 20 photos</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Clinic interior, equipment, treatment rooms, before/after photos</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Upload tile */}
            {gallery.length < 20 && (
              <div
                onClick={() => galleryRef.current?.click()}
                style={{ aspectRatio: '1', border: '2px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--bg)', gap: 6 }}
              >
                {uploading === 'gallery' ? (
                  <div style={{ width: 28, height: 28, border: '3px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>
                    <span style={{ fontSize: 28 }}>+</span>
                    <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>Add Photo</span>
                  </>
                )}
              </div>
            )}

            {/* Photo tiles */}
            {gallery.map(photo => (
              <div key={photo.id} style={{ aspectRatio: '1', borderRadius: 12, overflow: 'hidden', position: 'relative', border: '1px solid var(--border)' }}>
                <img src={photo.url} alt={photo.caption || 'Clinic photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => deletePhoto(photo.id)}
                  style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</button>
                {photo.category && (
                  <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 10, fontWeight: 600, padding: '2px 6px', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 4 }}>{photo.category.replace('_', ' ')}</div>
                )}
              </div>
            ))}
          </div>

          <input ref={galleryRef as any} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const file = e.target.files?.[0]; if (file) uploadFile(file, 'gallery') }} />

          {gallery.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 14 }}>
              No photos yet. Upload your first clinic photo above.
            </div>
          )}
        </div>

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
