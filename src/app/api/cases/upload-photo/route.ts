// POST /api/cases/upload-photo — single-image upload for the case-create
// form. Mirrors the Cloudinary pattern used by /api/cloudinary/upload but
// stays lighter: no DB write here. The case-create page collects the
// returned URLs in local state and submits them in one shot to
// POST /api/cases, where the case row + case_photos rows are inserted
// transactionally.

import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
})

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_KINDS = ['before', 'after', 'xray_before', 'xray_after'] as const

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the caller is a known dentist; we don't need the row id here,
  // but rejecting non-dentist auth users keeps the Cloudinary folder
  // clean and matches the policy on cases.dentist_id.
  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const kind = formData.get('kind') as string | null
  if (!file)                                         return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!file.type.startsWith('image/'))               return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  if (file.size > MAX_SIZE)                          return NextResponse.json({ error: 'File too large (10 MB max)' }, { status: 400 })
  if (!kind || !ALLOWED_KINDS.includes(kind as any)) return NextResponse.json({ error: 'Invalid photo kind' }, { status: 400 })

  try {
    const ab = await file.arrayBuffer()
    const dataUri = `data:${file.type};base64,${Buffer.from(ab).toString('base64')}`
    const result = await cloudinary.uploader.upload(dataUri, {
      // X-rays are kept full-detail (greyscale, fine bone trabeculation).
      // Clinical photos are capped to 1600 px wide so the page weight
      // stays sane on mobile.
      folder: `cases/${dentist.id}/${kind}`,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: kind.startsWith('xray') ? [{ width: 1800, crop: 'limit' }] : [{ width: 1600, crop: 'limit' }],
      quality: 'auto:good',
      fetch_format: 'auto',
    })
    return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
  } catch (err: any) {
    return NextResponse.json({ error: `Upload failed: ${err?.message ?? 'unknown'}` }, { status: 500 })
  }
}
