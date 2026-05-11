import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (errorParam) {
    return NextResponse.redirect(`${origin}/for-dentists/login?error=${errorParam}&desc=${errorDescription}`)
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && data.user) {
        return NextResponse.redirect(`${origin}/for-dentists/dashboard`)
      }
      return NextResponse.redirect(`${origin}/for-dentists/login?error=exchange_failed&detail=${error?.message}`)
    } catch (e: any) {
      return NextResponse.redirect(`${origin}/for-dentists/login?error=exception&detail=${e.message}`)
    }
  }

  return NextResponse.redirect(`${origin}/for-dentists/login?error=no_code`)
}