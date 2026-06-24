import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { getCityBySlug } from '@/config/cities'
import { getCityFrom } from '@/lib/email'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  // Admin gate. Without this, any anonymous POST with a dentist's email
  // mints a magic link and emails it to them — account-takeover vector
  // if the inbox is compromised, spam-bomb vector, and account enumeration
  // via 200-vs-404 response. Identity from the JWT cookie; admin_users
  // lookup via service-role so we don't depend on a self-read RLS policy.
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  // Check dentist exists; pull city so the magic-link email matches their brand.
  const { data: dentist } = await supabase.from('dentists').select('name, clinic_name, city').eq('email', email).single()
  if (!dentist) return NextResponse.json({ error: 'No dentist account found with this email' }, { status: 404 })

  const city = getCityBySlug((dentist as any).city)
  // Redirect origin priority:
  //   1. Origin/Referer of the request — i.e. whichever city domain the
  //      admin is on when sending the link. Each city is a separate apex
  //      with its own Supabase auth cookie scope, so the magic-link
  //      callback MUST land on the same origin the admin's own session
  //      lives on; otherwise the cookie set by Supabase ends up on the
  //      wrong apex and the dentist's "click → dashboard" loop sends them
  //      back to /login.
  //   2. Fallback to the dentist's stored city.domain. This is the legacy
  //      behaviour and is correct when the dentist row has a populated
  //      city column AND the admin is on the same city domain. Used only
  //      when Origin and Referer are both missing (rare — server-to-server
  //      callers, curl without the headers).
  //
  // The previous code skipped (1) entirely and ALWAYS used the dentist
  // row's city. Legacy rows with NULL or unknown city silently fell
  // through to DEFAULT_CITY = 'mumbai' in getCityBySlug, which is the
  // "all magic links redirect to dentistinmumbai.in" symptom.
  const headerOrigin = request.headers.get('origin')
    || request.headers.get('referer')?.split('/').slice(0, 3).join('/')
    || null
  const origin = headerOrigin || `https://${city.domain}`

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
    from: getCityFrom((dentist as any).city),
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
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px; text-align: center;">© ${new Date().getFullYear()} DentistIn. All rights reserved.</p>
        </div>
      </div>
    `,
  })

  return NextResponse.json({ success: true })
}
