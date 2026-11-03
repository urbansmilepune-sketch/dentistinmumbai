import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { dentistAppMetadata, dentistAppViewport } from '@/lib/dentistApp'
import { createClient } from '@/lib/supabase/server'
import { REMEMBER_COOKIE } from '@/lib/auth/rememberMe'

// Client component → metadata lives here. Noindex the login page (Section 8 —
// utility routes). Also Disallowed in robots.ts and absent from the sitemap.
export const viewport = dentistAppViewport

export const metadata: Metadata = {
  ...dentistAppMetadata,
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // 30-day "remember me" safety net. Many dashboard pages check the session in
  // the browser and push to /for-dentists/login when it has lapsed, which skips
  // the proxy's silent re-login (that only runs on /for-dentists/dashboard).
  // So if a dentist lands here with no session but a remember cookie, send
  // them through the same silent re-login. That route clears the cookie on any
  // failure and comes back here, so this can't loop. Log out clears the cookie
  // first, so logging out still shows this page.
  const cookieStore = await cookies()
  if (cookieStore.get(REMEMBER_COOKIE)?.value) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/api/auth/remember-me?next=%2Ffor-dentists%2Fdashboard')
  }
  return children
}
