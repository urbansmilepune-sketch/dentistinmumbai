import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import AlertLine from '@/components/national/AlertLine'
import AlertSettings from '@/components/national/AlertSettings'
import { adminDb, getViewerDentist, isNationalRequest } from '@/lib/national'
import { loadAlerts, markAllSeen, readPrefs } from '@/lib/networkAlerts'

// dentistinindia.in/alerts (27 Nov 2026): everything that happened on the
// dentist's profile and cases, grouped ("Dr A and 2 others liked your
// case"), plus the Alert settings switches. Opening it clears the bell.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Alerts | DentistIn India',
  robots: { index: false, follow: false },
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  if (!(await isNationalRequest())) {
    // On a city site, hop over signed in.
    redirect('/api/auth/india-handoff?next=alerts')
  }
  const viewer = await getViewerDentist()
  if (!viewer) redirect('/for-dentists/login?next=%2Falerts')
  if (!viewer.is_active) notFound()
  const sp = await searchParams

  const db = adminDb()
  const items = await loadAlerts(viewer.id, 120, db)
  const { data: me } = await db.from('dentists').select('network_alert_prefs').eq('id', viewer.id).maybeSingle()
  const prefs = readPrefs((me as any)?.network_alert_prefs)
  // Mark seen after reading, so this visit still shows what was new.
  await markAllSeen(viewer.id, db)

  const fresh = items.filter(i => i.unseen)
  const earlier = items.filter(i => !i.unseen)
  const label: React.CSSProperties = { margin: '0 0 6px', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#64748B' }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }

  return (
    <NationalShell badge="Alerts">
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 24, color: '#0F1923' }}>Alerts</h1>
        {items.length === 0 && (
          <div style={{ ...card, padding: 18, fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
            Nothing yet. When a dentist follows you, likes your case, replies to you or marks your reply helpful, it shows here.
          </div>
        )}
        {fresh.length > 0 && (
          <section>
            <h2 style={label}>New</h2>
            <div style={card}>{fresh.map((it, i) => <AlertLine key={it.key} item={it} first={i === 0} />)}</div>
          </section>
        )}
        {earlier.length > 0 && (
          <section>
            <h2 style={label}>Earlier</h2>
            <div style={card}>{earlier.map((it, i) => <AlertLine key={it.key} item={it} first={i === 0} />)}</div>
          </section>
        )}
        <section id="settings">
          <h2 style={label}>Alert settings</h2>
          <AlertSettings initial={prefs} highlight={sp.settings === '1'} />
        </section>
      </main>
    </NationalShell>
  )
}
