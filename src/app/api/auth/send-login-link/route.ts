import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check dentist exists
  const { data: dentist } = await supabase.from('dentists').select('name, clinic_name').eq('email', email).single()
  if (!dentist) return NextResponse.json({ error: 'No dentist account found with this email' }, { status: 404 })

  // Create/invite user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'https://www.dentistinmumbai.in/for-dentists/dashboard' }
  })

  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  // Send branded email with magic link
  await resend.emails.send({
    from: 'hello@dentistinmumbai.in',
    to: email,
    subject: `Access your DentistInMumbai.in dashboard — ${dentist.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 28px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">DentistInMumbai.in</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Your Dashboard Access</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-radius: 0 0 10px 10px;">
          <h2 style="color: #0F1923; margin-bottom: 8px;">Hello, ${dentist.name}!</h2>
          <p style="color: #374151; font-size: 15px; margin-bottom: 24px;">Click the button below to access your dentist dashboard. The link expires in 1 hour.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${(authData as any)?.properties?.action_link}" style="background: #0057A8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Access My Dashboard →</a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Once inside, you can set a permanent password from your profile settings.</p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px; text-align: center;">© 2026 dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
        </div>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
