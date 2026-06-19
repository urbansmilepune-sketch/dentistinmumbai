// POST /api/dentist/upload-logo — clinic logo upload for the dashboard
// Branding section. Mirrors the Cloudinary SDK pattern used by
// /api/cloudinary/upload and /api/cases/upload-photo (data-URI upload, no
// unsigned preset). The logo is squared to 400×400 (crop: fit, so the whole
// mark is kept and padded rather than cropped) and its secure_url is written
// to dentists.clinic_logo_url. It then renders top-left on invoice PDFs and
// top-right on prescription PDFs.
import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDentistOwner } from '@/lib/dentistSession'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
})

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  const dentist = await getDentistOwner()
  if (!dentist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file)                              return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Logo must be a JPEG, PNG or WebP image' }, { status: 400 })
  if (file.size > MAX_SIZE)               return NextResponse.json({ error: 'Logo too large. Max 2MB.' }, { status: 400 })

  try {
    const ab = await file.arrayBuffer()
    const dataUri = `data:${file.type};base64,${Buffer.from(ab).toString('base64')}`
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `dentistin/logos/${dentist.id}`,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      // crop: 'fit' keeps the entire mark inside 400×400 (no cropping); the
      // logo stays square-bounded for the PDF/profile slots without losing
      // any of a wide wordmark.
      transformation: [{ width: 400, height: 400, crop: 'fit' }],
      quality: 'auto:good',
      fetch_format: 'auto',
    })

    // RLS-aware write so a denied update is observable (.select returns the
    // row only when the policy allows it). The dentist can always update
    // their own row, so a 0-row result means the session/email is off.
    const supabase = await createClient()
    const { data: rows, error } = await supabase
      .from('dentists')
      .update({ clinic_logo_url: result.secure_url, logo_updated_at: new Date().toISOString() })
      .eq('id', dentist.id)
      .select('id')
    if (error) return NextResponse.json({ error: `Save failed: ${error.message}` }, { status: 500 })
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'Save failed — row not updated.' }, { status: 500 })

    return NextResponse.json({ url: result.secure_url })
  } catch (err: any) {
    return NextResponse.json({ error: `Upload failed: ${err?.message ?? 'unknown'}` }, { status: 500 })
  }
}
