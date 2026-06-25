// OWNER VIEW — rendered at the very top ONLY when the logged-in dentist is
// viewing their own profile (the page gates this on session id === profile
// id, so it never reaches patients/public).
//
// The percentage comes from profileCompletion.ts (the SAME score the
// dashboard/admin use — that file is untouched). The checklist below is a
// SEPARATE curated list of high-impact missing items, deliberately not tied
// to the % math — it's "top things to fix", not a breakdown of the score.

import Link from 'next/link'
import { NAVY, TEAL } from './profileTheme'
import { EyeIcon } from './profileIcons'

export interface ChecklistItem {
  label: string
  href: string
  impact?: string
}

interface Props {
  completionPct: number
  checklist: ChecklistItem[]
}

export default function OwnerBanner({ completionPct, checklist }: Props) {
  const low = completionPct < 60
  const barColor = low ? '#F59E0B' : TEAL

  return (
    <div style={{ background: NAVY, color: '#fff', padding: '14px 0' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <EyeIcon size={18} color="#fff" />
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>This is how patients see your profile</span>
          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: barColor }}>{completionPct}%</span>
        </div>

        {/* Completion bar (mirrors profileCompletion.ts) */}
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
          <div style={{ width: `${completionPct}%`, height: '100%', background: barColor, borderRadius: 999, transition: 'width 0.3s' }} />
        </div>

        {low && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#FCD34D' }}>
            Patients skip profiles without photos. You&apos;re losing bookings.
          </div>
        )}

        {checklist.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>Top things to fix</span>
            {checklist.map(item => (
              <div key={item.href + item.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.label}</div>
                  {item.impact && <div style={{ fontSize: 12, color: TEAL, fontWeight: 600, marginTop: 1 }}>{item.impact}</div>}
                </div>
                <Link href={item.href} style={{ flexShrink: 0, padding: '7px 16px', background: TEAL, color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  Add
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
