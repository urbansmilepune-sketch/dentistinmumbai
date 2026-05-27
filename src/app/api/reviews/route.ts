import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Send OTP via MSG91 OTP API v5.
// Required env: MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID. Optional: MSG91_SENDER_ID
// (DLT-registered header; overrides the template default if set).
async function sendOTP(phone: string, otp: string) {
  if (!process.env.MSG91_AUTH_KEY) {
    console.log('[OTP Dev Mode] OTP for', phone, ':', otp)
    return true
  }
  const params = new URLSearchParams({
    template_id: process.env.MSG91_OTP_TEMPLATE_ID || '',
    mobile: `91${phone}`,
    otp,
  })
  if (process.env.MSG91_SENDER_ID) params.set('sender', process.env.MSG91_SENDER_ID)
  try {
    const res = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`, {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
    })
    if (!res.ok) console.error('[MSG91 OTP]', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (err) {
    console.error('[MSG91 OTP] network error', err)
    return false
  }
}

// POST /api/reviews — step 1: send OTP, step 2: verify OTP and submit review
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body

  if (action === 'send_otp') {
    const { phone } = body
    if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'Valid 10-digit phone required' }, { status: 400 })
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 mins

    await supabase.from('review_otps').upsert({
      phone: phone.replace(/\s/g, ''), otp, expires_at, verified: false
    }, { onConflict: 'phone' })

    await sendOTP(phone.replace(/\s/g, ''), otp)
    return NextResponse.json({ success: true, message: 'OTP sent' })
  }

  if (action === 'submit_review') {
    const { phone, otp, dentist_id, patient_name, rating, review_text, treatment } = body
    if (!phone || !otp || !dentist_id || !patient_name || !rating || !review_text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    try {
      // Verify OTP. .maybeSingle() so a wrong code returns null cleanly
      // (the existing `if (!otpRecord)` then surfaces the friendly 400);
      // .single() would 500 the patient with a PGRST116 instead.
      const { data: otpRecord, error: otpErr } = await supabase
        .from('review_otps')
        .select('*')
        .eq('phone', phone.replace(/\s/g, ''))
        .eq('otp', otp)
        .eq('verified', false)
        .maybeSingle()

      if (otpErr) {
        console.error('[reviews] otp lookup failed', { code: otpErr.code, message: otpErr.message })
        return NextResponse.json({ error: 'Could not verify OTP — please try again' }, { status: 500 })
      }
      if (!otpRecord) return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
      if (new Date(otpRecord.expires_at) < new Date()) return NextResponse.json({ error: 'OTP expired. Please resend.' }, { status: 400 })

      // Mark OTP as used
      await supabase.from('review_otps').update({ verified: true }).eq('phone', phone.replace(/\s/g, ''))

      // Submit review. .maybeSingle() because we want a clean null on the
      // off-chance the insert returns no row (RLS edge cases) rather than
      // letting .single() throw before we can surface a 500.
      const { data, error } = await supabase.from('reviews').insert({
        dentist_id, patient_name, patient_phone: phone.replace(/\s/g, ''),
        rating: parseInt(rating), review_text, treatment: treatment || null,
        status: 'pending', // Admin must approve
      }).select('id').maybeSingle()

      if (error || !data) {
        console.error('[reviews] insert failed', { code: error?.code, message: error?.message })
        return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
      }
      return NextResponse.json({ success: true, id: data.id })
    } catch (err: any) {
      console.error('[reviews] submit_review threw', { name: err?.name, message: err?.message })
      return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
