'use client'

// Sub-tab switcher for /dashboard/analytics — sits between the page
// header (rendered by analytics/page.tsx) and the actual content.
//
// Two sub-tabs:
//   📈 Engagement       — passed in as `children` (server-rendered by
//                         the parent page so the headline counts are
//                         streamed with the first byte)
//   📊 Revenue & Reports — rendered client-side by <ReportsView>; its
//                         data fetch fires the first time the sub-tab
//                         becomes active, so engagement-only visitors
//                         don't pay for the heavier reports payload.
//
// Deep links: /dashboard/analytics?tab=reports lands directly on the
// reports view. The /dashboard/reports route also still works — it
// 302s to /dashboard/analytics?tab=reports — so existing bookmarks and
// any UI that still links to /reports continue to function.

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ReportsView from './ReportsView'
import PLView from './PLView'

type SubTab = 'engagement' | 'reports' | 'pl'

const TABS: Array<{ key: SubTab; label: string }> = [
  { key: 'engagement', label: '📈 Engagement' },
  { key: 'reports',    label: '📊 Revenue & Reports' },
  { key: 'pl',         label: '🧾 P&L' },
]

export default function AnalyticsTabs({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const initialParam = searchParams.get('tab')
  const initial: SubTab = initialParam === 'reports' ? 'reports' : initialParam === 'pl' ? 'pl' : 'engagement'
  const [active, setActive] = useState<SubTab>(initial)

  return (
    <div>
      {/* Sub-tab strip — same look as the patient detail page's sub-tabs
          (chart / images / lab) so the dashboard feels consistent. */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: active === t.key ? 700 : 500,
              color: active === t.key ? 'var(--blue)' : 'var(--muted)',
              borderBottom: `2px solid ${active === t.key ? 'var(--blue)' : 'transparent'}`,
              whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Engagement view is server-rendered upstream; we keep it mounted
          (just hidden) when the dentist switches to Reports so flipping
          back doesn't re-fetch or re-render. Reports is the inverse —
          mount-on-first-visit + stay-mounted. */}
      <div style={{ display: active === 'engagement' ? 'block' : 'none' }}>
        {children}
      </div>
      {active === 'reports' && (
        <ReportsView />
      )}
      {active === 'pl' && (
        <PLView />
      )}
    </div>
  )
}
