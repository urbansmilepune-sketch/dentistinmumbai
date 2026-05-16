import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getCityBySlug } from '@/config/cities'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check dentist exists; pull city so the magic-link email matches their brand.
  const { data: dentist } = await supabase.from('dentists').select('name, clinic_name, city').eq('email', email).single()
  if (!dentist) return NextResponse.json({ error: 'No dentist account found with this email' }, { status: 404 })

  const city = getCityBySlug((dentist as any).city)
  const origin = `https://${city.domain}`

  // Try a magic link first — works for any dentist who already has an
  // auth.users row (everyone post-approval-fix). For legacy dentists that
  // were approved before the auto-login fix, magiclink fails because there
  // is no auth user yet; fall back to type='invite', which both creates the
  // row and returns a usable action link. Same belt-and-braces pattern the
  // approval helper uses.
  let authData: any = null
  const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${origin}/for-dentists/dashboard` }
  })
  if (magicError) {
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${origin}/for-dentists/dashboard` }
    })
    if (inviteError) {
      console.error('[send-login-link] both magiclink and invite failed', { email, magicError, inviteError })
      return NextResponse.json({ error: inviteError.message || magicError.message }, { status: 500 })
    }
    authData = inviteData
  } else {
    authData = magicData
  }

  // Send branded email with magic link
  await resend.emails.send({
    from: 'hello@dentistinmumbai.in',
    to: email,
    subject: `Access your ${city.domain} dashboard — ${dentist.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 28px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${city.domain}</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Your Dashboard Access</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-radius: 0 0 10px 10px;">
          <h2 style="color: #0F1923; margin-bottom: 8px;">Hello, ${dentist.name}!</h2>
          <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">Click the button below to access your dentist dashboard. The link expires in 1 hour.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${(authData as any)?.properties?.action_link}" style="background: #0057A8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Access My Dashboard →</a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Once inside, you can set a permanent password from your profile settings.</p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px; text-align: center;">© ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative</p>
        </div>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
