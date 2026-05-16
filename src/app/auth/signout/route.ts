// Cookie-aware sign-out so server-rendered pages (e.g. the staff portal)
// can ship a plain HTML form button instead of becoming a client component.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/for-dentists/login', request.url))
}
