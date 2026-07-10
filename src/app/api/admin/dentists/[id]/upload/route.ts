// Admin-scoped photo upload for a specific dentist.
//
// The dentist-side /api/cloudinary/upload keys the folder + DB write off the
// LOGGED-IN dentist's session, so an admin/rep can't use it to upload on
// someone else's behalf. This route takes the target dentist id from the URL,
// gates on admin membership (service role, RLS-exempt), then reuses the exact
// same Cloudinary transforms + folder convention and writes the resolved URL
// back to the dentist's profile_photo / cover_photo column.
import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

// Only the two single-value profile images are settable here. Gallery / xray
// live in their own table and stay on the dentist-side flow.
const ALLOWED_TYPES = ['profile', 'cover'] as const
type UploadType = typeof ALLOWED_TYPES[number]
const MAX_SIZE = 10 * 1024 * 1024

// Same transforms as the dentist-side route so admin-uploaded images match
// exactly (400×400 face-cropped avatar, 1200×400 cover banner).
const TRANSFORMS: Record<UploadType, object[]> = {
  profile: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  cover:   [{ width: 1200, height: 400, crop: 'fill', gravity: 'center', quality: 'auto:good' }],
}

const COLUMN: Record<UploadType, 'profile_photo' | 'cover_photo'> = {
  profile: 'profile_photo',
  cover: 'cover_photo',
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin_db = await requireAdmin()
  if (!admin_db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing dentist id' }, { status: 400 })

  const envOk = !!(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  if (!envOk) return NextResponse.json({ error: 'Image uploads are not configured on the server.' }, { status: 500 })

  // Confirm the target dentist exists before spending a Cloudinary upload.
  const { data: dentist, error: lookupErr } = await admin_db
    .from('dentists')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  if (!dentist) return NextResponse.json({ error: 'Dentist not found' }, { status: 404 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!type || !ALLOWED_TYPES.includes(type as UploadType))
      return NextResponse.json({ error: `Invalid type. Must be: ${ALLOWED_TYPES.join(', ')}` }, { status: 400 })
    if (!file.type.startsWith('image/'))
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 })

    const uploadType = type as UploadType
    const arrayBuffer = await file.arrayBuffer()
    const base64 = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`

    let result: { secure_url: string; public_id: string }
    try {
      result = await cloudinary.uploader.upload(base64, {
        folder: `dentistinmumbai/${id}/${uploadType}`,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: TRANSFORMS[uploadType],
        quality: 'auto:good',
        fetch_format: 'auto',
      })
    } catch (cloudErr: any) {
      return NextResponse.json({ error: `Cloudinary upload failed: ${cloudErr?.message ?? 'unknown'}` }, { status: 500 })
    }

    // Service-role write — RLS-exempt, so unlike the dentist route we don't
    // need the .select() round-trip to detect a denied write. Still verify a
    // row changed so a stale id can't silently succeed.
    const column = COLUMN[uploadType]
    const { data: rows, error } = await admin_db
      .from('dentists')
      .update({ [column]: result.secure_url })
      .eq('id', id)
      .select('id')
    if (error) return NextResponse.json({ error: `DB save failed: ${error.message}` }, { status: 500 })
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'DB save failed — row not updated.' }, { status: 500 })

    return NextResponse.json({ success: true, url: result.secure_url, column })
  } catch (error: any) {
    return NextResponse.json({ error: `Upload failed: ${error?.message ?? 'unknown error'}` }, { status: 500 })
  }
}
