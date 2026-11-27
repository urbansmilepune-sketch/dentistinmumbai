import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { getViewerDentist, isNationalRequest, cityNameOf } from '@/lib/national'
import { liveCaseCount } from '@/lib/firstCase'
import { getOrCreateInviteCode } from '@/lib/invites'
import { NATIONAL_ORIGIN } from '@/config/cities'
import FirstCaseFlow from './FirstCaseFlow'

// /first-case — the quick 3-step case (photos, one line, check and post)
// for dentists who have just claimed their profile (27 Nov 2026). Linked
// from the claim screen, the home "Post your first case" card and the
// day-1 / day-5 WhatsApp nudge. Works for later cases too.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Post your first case | Dentist In India',
  robots: { index: false, follow: false },
}

export default async function FirstCasePage() {
  if (!(await isNationalRequest())) notFound()
  const viewer = await getViewerDentist()
  if (!viewer) redirect('/for-dentists/login?next=/first-case')
  if (!viewer.is_active) redirect('/for-dentists/pending')

  const [count, code] = await Promise.all([liveCaseCount(viewer.id), getOrCreateInviteCode(viewer.id)])

  return (
    <NationalShell badge="Post a Case">
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 64px' }}>
        <FirstCaseFlow
          first={count === 0}
          cityName={cityNameOf(viewer.city)}
          inviteLink={code ? `${NATIONAL_ORIGIN}/invite/${code}` : null}
          whatsappAlerts={process.env.ACTIVITY_WHATSAPP_ENABLED === 'true'}
        />
      </main>
    </NationalShell>
  )
}
