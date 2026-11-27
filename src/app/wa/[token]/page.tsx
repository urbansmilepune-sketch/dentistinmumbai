import type { Metadata } from 'next'
import Link from 'next/link'
import NationalShell from '@/components/national/NationalShell'
import { adminDb } from '@/lib/national'
import { checkWaLoginToken } from '@/lib/waLoginLink'
import { drName } from '@/lib/dentistName'

// Landing page for the link in our WhatsApp "photos saved" reply. One tap
// signs the dentist in on dentistinindia.in and opens /cases/new. The tap is
// a POST so WhatsApp's link-preview robot (which only GETs) can't sign in.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Finish your case | Dentist In India',
  robots: { index: false, follow: false },
}

export default async function WaCaseLinkPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { token } = await params
  const sp = await searchParams
  const check = checkWaLoginToken(token)
  let name: string | null = null
  if (check.ok) {
    const { data } = await adminDb().from('dentists').select('name, email, is_active').eq('id', check.dentistId).maybeSingle()
    if (data?.email && data.is_active !== false) name = drName((data as any).name)
  }
  const failed = sp.error === '1'
  // ?to=alerts: the link in the WhatsApp activity summary (27 Nov 2026).
  // ?to=week: the link in the Monday "Your week" recap.
  const week = sp.to === 'week'
  const alerts = sp.to === 'alerts' || week
  const dest = week ? 'week' : 'alerts'

  const card: React.CSSProperties = { maxWidth: 440, margin: '48px auto', padding: '28px 24px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, textAlign: 'center' }
  const btn: React.CSSProperties = { display: 'block', width: '100%', padding: '14px 18px', borderRadius: 12, border: 0, background: '#0F766E', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }

  return (
    <NationalShell badge={week ? 'Your week' : alerts ? 'Alerts' : 'Post a Case'}>
      <main style={{ padding: '0 16px' }}>
        <div style={card}>
          {name && !failed ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F1923', marginBottom: 8 }}>{week ? 'See your week on DentistIn India' : alerts ? 'See your DentistIn India alerts' : 'Your WhatsApp photos are ready'}</h1>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
                {week ? `Continue as ${name} to see who viewed your cases, followed you and replied this week.` : alerts ? `Continue as ${name} to see who followed you, liked your cases and replied.` : `Continue as ${name} to add the case details and patient consent.`}
              </p>
              <form method="post" action="/api/auth/whatsapp-link">
                <input type="hidden" name="token" value={token} />
                {alerts && <input type="hidden" name="to" value={dest} />}
                <button type="submit" style={btn}>{week ? 'See my week' : alerts ? 'See my alerts' : 'Continue to my case'}</button>
              </form>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F1923', marginBottom: 8 }}>
                {failed ? 'We could not sign you in' : check.ok || (!check.ok && check.reason === 'expired') ? 'This link has expired' : 'This link is not valid'}
              </h1>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
                {week ? 'Sign in with the same email you use on your city site to see your week.' : alerts ? 'Sign in with the same email you use on your city site to see your alerts.' : 'Your photos are still saved. Sign in with the same email you use on your city site and they will be waiting for you.'}
              </p>
              <Link href={alerts ? `/for-dentists/login?next=/${dest}` : '/for-dentists/login?next=/cases/new'} style={btn}>{week ? 'Sign in and see my week' : alerts ? 'Sign in and see my alerts' : 'Sign in and finish my case'}</Link>
            </>
          )}
        </div>
      </main>
    </NationalShell>
  )
}
