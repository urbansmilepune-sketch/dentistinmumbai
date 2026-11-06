// POST /api/reviews/verified — submit a review from a /review/[token] link.
// Body: { token, rating 1-5, tags?: string[], text?: string }
//
// The token proves the patient was sent the link, so no OTP. Every review
// still lands as status 'pending' for admin approval (same as the OTP form);
// approval is the same for good and bad reviews.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ALL_TAGS, reviewDisplayName } from '@/lib/reviewRequests'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as any
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return NextResponse.json({ error: 'This link does not work.' }, { status: 400 })
  }
  const rating = Number(body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Please tap a star rating.' }, { status: 400 })
  }
  const tags = Array.isArray(body?.tags)
    ? Array.from(new Set((body.tags as unknown[]).filter((t): t is string => typeof t === 'string' && ALL_TAGS.includes(t)))).slice(0, 6)
    : []
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 1000) : ''

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: req, error: reqErr } = await db
    .from('review_requests')
    .select('id, dentist_id, appointment_id, source, patient_name, patient_phone, treatment, used_at, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (reqErr) {
    console.error('[reviews/verified] lookup failed', reqErr.message)
    return NextResponse.json({ error: 'Could not save your review. Please try again.' }, { status: 500 })
  }
  if (!req) return NextResponse.json({ error: 'This link does not work.' }, { status: 404 })
  if (req.used_at) return NextResponse.json({ error: 'You have already rated this visit. Thank you.' }, { status: 409 })
  if (Date.parse(req.expires_at) < Date.now()) return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })

  // Claim the link first so a double tap can never create two reviews.
  const nowIso = new Date().toISOString()
  const { data: claimed } = await db
    .from('review_requests')
    .update({ used_at: nowIso })
    .eq('id', req.id)
    .is('used_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'You have already rated this visit. Thank you.' }, { status: 409 })
  }

  const { data: review, error: insErr } = await db
    .from('reviews')
    .insert({
      dentist_id: req.dentist_id,
      patient_name: reviewDisplayName(req.patient_name),
      patient_phone: req.patient_phone,
      rating,
      review_text: text || null,
      treatment: req.treatment || null,
      tags,
      status: 'pending',
      // "Verified visit" means the link came from a recorded visit: an
      // appointment marked Done or a visit saved in the clinic software. A
      // link a dentist typed a number into by hand is not one.
      verified_visit: !!req.appointment_id || req.source === 'visit',
      appointment_id: req.appointment_id,
      review_request_id: req.id,
    })
    .select('id')
    .single()

  if (insErr || !review) {
    console.error('[reviews/verified] insert failed', { code: insErr?.code, message: insErr?.message })
    // Give the link back so the patient can try again.
    await db.from('review_requests').update({ used_at: null }).eq('id', req.id)
    return NextResponse.json({ error: 'Could not save your review. Please try again.' }, { status: 500 })
  }

  await db.from('review_requests').update({ review_id: review.id }).eq('id', req.id)
  return NextResponse.json({ success: true })
}
