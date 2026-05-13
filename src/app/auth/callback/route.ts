import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/for-dentists/login?error=oauth_failed&reason=no_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (!error) {
    return NextResponse.redirect(`${origin}/for-dentists/dashboard`)
  }

  console.error('[auth/callback] exchangeCodeForSession failed', { message: error.message, code })
  return NextResponse.redirect(
    `${origin}/for-dentists/login?error=oauth_failed&reason=${encodeURIComponent(error.message)}`
  )
}
