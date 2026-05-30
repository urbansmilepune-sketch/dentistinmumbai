'use client'

import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'

// Draws the selected crop region onto a canvas and returns a JPEG Blob.
// pixelCrop is in the natural pixel coordinates of the source image (that's
// what react-easy-crop's onCropComplete hands back via croppedAreaPixels),
// so no extra scaling math is needed beyond a 1:1 drawImage.
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', err => reject(err))
    // Source is always a local object URL from the file picker, so this is
    // same-origin; setting crossOrigin keeps the canvas untainted regardless.
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height,
  )
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas is empty'))
    }, 'image/jpeg', 0.92)
  })
}

interface PhotoCropModalProps {
  imageSrc: string
  saving?: boolean
  onCancel: () => void
  onSave: (blob: Blob) => void
}

export default function PhotoCropModal({ imageSrc, saving, onCancel, onSave }: PhotoCropModalProps) {
  // crop is the centre offset, zoom is the scale. react-easy-crop centres the
  // crop box by default; we bias the initial view slightly toward the top of
  // the frame (where a headshot's face usually sits) so the default square
  // already lands on the face before the dentist nudges it.
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  async function handleSave() {
    if (!croppedAreaPixels) return
    const blob = await getCroppedBlob(imageSrc, croppedAreaPixels)
    onSave(blob)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={saving ? undefined : onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 440,
        background: '#fff', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>Crop your photo</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Drag to reposition · pinch or use the slider to zoom. Keep your face inside the square.
          </p>
        </div>

        {/* Crop canvas — square 1:1 frame, round mask so it reads as a headshot */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#1a1a1a' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }} aria-hidden="true">🔍</span>
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              style={{ flex: 1, accentColor: 'var(--blue)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={onCancel} disabled={saving}
              style={{ padding: '11px 20px', minHeight: 44, background: '#fff', color: 'var(--text)', border: '1.5px solid var(--border)', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}
            >Cancel</button>
            <button
              type="button" onClick={handleSave} disabled={saving || !croppedAreaPixels}
              style={{ padding: '11px 24px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: (saving || !croppedAreaPixels) ? 'not-allowed' : 'pointer', opacity: (saving || !croppedAreaPixels) ? 0.6 : 1 }}
            >{saving ? 'Saving…' : 'Save Photo'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
