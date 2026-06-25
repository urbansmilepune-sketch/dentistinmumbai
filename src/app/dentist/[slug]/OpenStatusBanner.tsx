// SECTION 4 — Open / closed banner. Driven by getOpenStatus(working_hours).
// The 'none' state is filtered out by the caller (page hides the banner when
// no hours are set), so this only ever renders 'open' or 'closed'.

import type { OpenStatus } from '@/lib/openStatus'
import { ClockIcon } from './profileIcons'

export default function OpenStatusBanner({ status }: { status: OpenStatus }) {
  if (status.state === 'none') return null
  const open = status.state === 'open'
  const fg = open ? '#047857' : '#475569'
  const bg = open ? '#ECFDF5' : '#F1F5F9'
  const border = open ? '#A7F3D0' : '#E2E8F0'
  const dot = open ? '#10B981' : '#94A3B8'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '11px 16px', borderRadius: 12,
      background: bg, border: `1px solid ${border}`,
    }}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
        {open && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: dot, animation: 'profilePulse 2s ease-out infinite' }} />}
      </span>
      <ClockIcon size={16} color={fg} />
      <span style={{ fontSize: 13.5, fontWeight: 700, color: fg }}>{status.label}</span>
    </div>
  )
}
