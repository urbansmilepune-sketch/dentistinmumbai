// SECTION 6 — Why choose. Renders the dentist's why_choose_us[] entries as
// tag pills with check icons. Caller hides the whole section when the
// filtered array is empty.

import { NAVY, TEAL } from './profileTheme'
import { CheckIcon } from './profileIcons'

export default function WhyChoose({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {items.map((tag, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', borderRadius: 12,
          background: '#fff', border: '1px solid var(--border)',
          fontSize: 14, fontWeight: 600, color: NAVY, lineHeight: 1.3,
        }}>
          <span aria-hidden style={{
            flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
            background: '#CCFBF1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckIcon size={13} color={TEAL} strokeWidth={3} />
          </span>
          {tag}
        </span>
      ))}
    </div>
  )
}
