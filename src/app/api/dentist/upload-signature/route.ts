// POST /api/dentist/upload-signature — digital signature upload for the
// dashboard Branding section. Same Cloudinary SDK pattern as upload-logo.
// The signature is fit inside 600×200 and forced to PNG so a photographed
// signature on white paper stays crisp; its secure_url lands in
// dentists.signature_url and renders in the prescription PDF footer above
// the doctor's name.
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

const MAX_SIZE = 1 * 1024 * 1024 // 1 MB
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
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Signature must be a JPEG, PNG or WebP image' }, { status: 400 })
  if (file.size > MAX_SIZE)               return NextResponse.json({ error: 'Signature too large. Max 1MB.' }, { status: 400 })

  try {
    const ab = await file.arrayBuffer()
    const dataUri = `data:${file.type};base64,${Buffer.from(ab).toString('base64')}`
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `dentistin/signatures/${dentist.id}`,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      // crop: 'fit' inside 600×200 keeps the whole signature; format png so
      // the stored asset is a clean PNG regardless of the source type.
      transformation: [{ width: 600, height: 200, crop: 'fit' }],
      format: 'png',
      quality: 'auto:good',
    })

    const supabase = await createClient()
    const { data: rows, error } = await supabase
      .from('dentists')
      .update({ signature_url: result.secure_url, signature_updated_at: new Date().toISOString() })
      .eq('id', dentist.id)
      .select('id')
    if (error) return NextResponse.json({ error: `Save failed: ${error.message}` }, { status: 500 })
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'Save failed — row not updated.' }, { status: 500 })

    return NextResponse.json({ url: result.secure_url })
  } catch (err: any) {
    return NextResponse.json({ error: `Upload failed: ${err?.message ?? 'unknown'}` }, { status: 500 })
  }
}
