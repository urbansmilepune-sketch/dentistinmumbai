import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const ALLOWED_TYPES = ['profile', 'cover', 'gallery', 'xray'] as const
type UploadType = typeof ALLOWED_TYPES[number]
const MAX_SIZE = 10 * 1024 * 1024

const TRANSFORMS: Record<UploadType, object[]> = {
  profile: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  cover:   [{ width: 1200, height: 300, crop: 'fill' }],
  gallery: [{ width: 1200, crop: 'limit' }],
  xray:    [{ width: 1200, crop: 'limit' }],
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get dentist linked to this auth user
  const { data: dentist } = await supabase
    .from('dentists')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

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

    const arrayBuffer = await file.arrayBuffer()
    const base64 = `data:${file.type};base64,${Buffer.from(arrayBuffer).toString('base64')}`

    const uploadType = type as UploadType
    const result = await cloudinary.uploader.upload(base64, {
      folder: `dentistinmumbai/${dentist.id}/${uploadType}`,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: TRANSFORMS[uploadType],
      quality: 'auto:good',
      fetch_format: 'auto',
    })

    // Save to database
    if (uploadType === 'profile') {
      await supabase.from('dentists').update({ profile_photo: result.secure_url }).eq('id', dentist.id)
    } else if (uploadType === 'cover') {
      await supabase.from('dentists').update({ cover_photo: result.secure_url }).eq('id', dentist.id)
    } else {
      await supabase.from('gallery_photos').insert({
        dentist_id: dentist.id,
        image_url: result.secure_url,
        category: uploadType === 'xray' ? 'xray' : 'clinic_interior',
      })
    }

    return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
  } catch (error) {
    console.error('[Cloudinary Upload]', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
