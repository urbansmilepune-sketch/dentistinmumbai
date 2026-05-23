// Photo upload endpoint shared by profile/cover/gallery/xray on the
// dentist dashboard and patient_photo on the EMR side.
//
// This file is currently instrumented with verbose [upload] logs so we
// can see exactly which step fails in Vercel. The logs include auth
// state, dentist lookup result, FormData shape (filename/size/type),
// the Cloudinary response, and the DB outcome including the supabase
// error message/code/details. The 500 responses also echo the
// underlying error message so the dashboard banner shows something
// actionable instead of a generic "Upload failed" — once we've
// confirmed the failure mode in prod, trim this back.
import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const ALLOWED_TYPES = ['profile', 'cover', 'gallery', 'xray', 'patient_photo'] as const
type UploadType = typeof ALLOWED_TYPES[number]
const MAX_SIZE = 10 * 1024 * 1024

// gallery_photos.category values used by the dentist photos page. Must match
// the SECTIONS keys in src/app/for-dentists/dashboard/photos/page.tsx. The
// xray endpoint writes its own category ('xray') and is gated separately.
const GALLERY_CATEGORIES = ['exterior', 'interior', 'equipment', 'team', 'certifications', 'before_after'] as const
type GalleryCategory = typeof GALLERY_CATEGORIES[number]

const TRANSFORMS: Record<UploadType, object[]> = {
  profile:       [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  cover:         [{ width: 1200, height: 400, crop: 'fill', gravity: 'center', quality: 'auto:good' }],
  gallery:       [{ width: 1200, crop: 'limit' }],
  xray:          [{ width: 1200, crop: 'limit' }],
  patient_photo: [{ width: 1600, crop: 'limit' }],
}

export async function POST(request: NextRequest) {
  const t0 = Date.now()
  // Env presence check — a missing CLOUDINARY_API_SECRET on Vercel makes
  // cloudinary.uploader.upload throw "Must supply api_key", which we'd
  // otherwise see as a generic 500 from the outer catch.
  const envOk = !!(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  console.log('[upload] start', {
    envOk,
    cloud_name_set: !!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key_set: !!process.env.CLOUDINARY_API_KEY,
    api_secret_set: !!process.env.CLOUDINARY_API_SECRET,
  })

  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr) console.error('[upload] auth.getUser error', authErr)
  console.log('[upload] auth user', user ? { id: user.id, email: user.email } : null)
  if (!user) return NextResponse.json({ error: 'Unauthorized — no auth user on this request (cookie/JWT missing).' }, { status: 401 })

  // Get dentist linked to this auth user. Used both as the owner id for
  // RLS-scoped writes and as the Cloudinary folder shard.
  const { data: dentist, error: dentistErr } = await supabase
    .from('dentists')
    .select('id')
    .eq('email', user.email)
    .single()
  if (dentistErr) console.error('[upload] dentist lookup error', dentistErr)
  console.log('[upload] dentist row', dentist)
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found for this email.' }, { status: 404 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null
    const rawCategory = formData.get('category') as string | null
    console.log('[upload] formData', {
      type,
      category: rawCategory,
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
    })

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!type || !ALLOWED_TYPES.includes(type as UploadType))
      return NextResponse.json({ error: `Invalid type. Must be: ${ALLOWED_TYPES.join(', ')}` }, { status: 400 })
    if (!file.type.startsWith('image/'))
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 })

    // For gallery uploads the client picks a category (one of the 6 dentist
    // photos sections). Validate explicitly — an unknown value would silently
    // create orphan rows that no section renders. Default to 'interior' for
    // backwards compat with older clients that don't send the field.
    let galleryCategory: GalleryCategory = 'interior'
    if (type === 'gallery') {
      if (rawCategory) {
        if (!(GALLERY_CATEGORIES as readonly string[]).includes(rawCategory)) {
          return NextResponse.json({ error: `Invalid category. Must be: ${GALLERY_CATEGORIES.join(', ')}` }, { status: 400 })
        }
        galleryCategory = rawCategory as GalleryCategory
      }
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`
    const uploadType = type as UploadType
    console.log('[upload] cloudinary upload starting', {
      uploadType,
      base64Bytes: base64.length,
      dentist_id: dentist.id,
    })

    let result: { secure_url: string; public_id: string }
    try {
      result = await cloudinary.uploader.upload(base64, {
        folder: `dentistinmumbai/${dentist.id}/${uploadType}`,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: TRANSFORMS[uploadType],
        quality: 'auto:good',
        fetch_format: 'auto',
      })
      console.log('[upload] cloudinary success', {
        public_id: result.public_id,
        secure_url: result.secure_url,
        elapsed_ms: Date.now() - t0,
      })
    } catch (cloudErr: any) {
      console.error('[upload] cloudinary upload threw', {
        message: cloudErr?.message,
        http_code: cloudErr?.http_code,
        name: cloudErr?.name,
      })
      return NextResponse.json({ error: `Cloudinary upload failed: ${cloudErr?.message ?? 'unknown'}` }, { status: 500 })
    }

    // Save to database. patient_photo is intentionally NOT persisted here —
    // the caller (the patient before/after photos page) inserts its own row
    // in patient_photos with the URL we return below.
    // .select('id') below makes RLS denial observable; without it a denied
    // write returns no error and no rows — the file uploads to Cloudinary
    // but the dentist's profile_photo column never changes.
    if (uploadType === 'profile') {
      const { data: rows, error } = await supabase
        .from('dentists')
        .update({ profile_photo: result.secure_url })
        .eq('id', dentist.id)
        .select('id')
      console.log('[upload] profile_photo update', { rowsAffected: rows?.length ?? 0, error })
      if (error) return NextResponse.json({ error: `DB save failed: ${error.message}` }, { status: 500 })
      if (!rows || rows.length === 0) return NextResponse.json({ error: 'DB save failed — row not updated (RLS denied or missing row).' }, { status: 500 })
    } else if (uploadType === 'cover') {
      const { data: rows, error } = await supabase
        .from('dentists')
        .update({ cover_photo: result.secure_url })
        .eq('id', dentist.id)
        .select('id')
      console.log('[upload] cover_photo update', { rowsAffected: rows?.length ?? 0, error })
      if (error) return NextResponse.json({ error: `DB save failed: ${error.message}` }, { status: 500 })
      if (!rows || rows.length === 0) return NextResponse.json({ error: 'DB save failed — row not updated (RLS denied or missing row).' }, { status: 500 })
    } else if (uploadType === 'gallery' || uploadType === 'xray') {
      // The DB column is `url`, not `image_url`. `.select(...).single()`
      // makes RLS denial observable.
      const insertPayload = {
        dentist_id: dentist.id,
        url: result.secure_url,
        category: uploadType === 'xray' ? 'xray' : galleryCategory,
      }
      console.log('[upload] gallery_photos insert payload', insertPayload)
      const { data: photoRow, error: insertErr } = await supabase
        .from('gallery_photos')
        .insert(insertPayload)
        .select('id, url, caption, category')
        .single()
      if (insertErr) {
        console.error('[upload] gallery_photos insert error', {
          message: insertErr.message,
          code: insertErr.code,
          details: insertErr.details,
          hint: insertErr.hint,
        })
        return NextResponse.json({ error: `DB save failed: ${insertErr.message}`, code: insertErr.code, hint: insertErr.hint, details: insertErr.details }, { status: 500 })
      }
      if (!photoRow) {
        console.error('[upload] gallery_photos insert returned no row (RLS SELECT denied?)')
        return NextResponse.json({ error: 'DB save failed — insert returned no row. Likely RLS SELECT denied on gallery_photos for this dentist.' }, { status: 500 })
      }
      console.log('[upload] gallery_photos row inserted', photoRow)
      return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id, photo: photoRow })
    }

    return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
  } catch (error: any) {
    // Outer catch: anything that escaped the per-step handlers above —
    // FormData parsing failure (e.g. body-size limit hit by Vercel before
    // the function ran), unexpected throw, etc.
    console.error('[upload] outer catch', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    })
    return NextResponse.json({ error: `Upload failed: ${error?.message ?? 'unknown error'}` }, { status: 500 })
  }
}
