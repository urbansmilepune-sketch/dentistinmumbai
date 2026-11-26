// One line in the bell dropdown and on /alerts: avatars, "Dr A and 2 others
// liked your case ...", the reply text for replies, and when.
import Link from 'next/link'
import Avatar from './home/Avatar'

export interface AlertLineItem {
  key: string
  kind: 'follow' | 'case_like' | 'case_comment' | 'post_reply' | 'helpful'
  actors: { id: string; name: string; slug: string; photo: string | null }[]
  count: number
  text: string
  snippet: string | null
  href: string
  at: string
  unseen: boolean
}

const BADGE: Record<AlertLineItem['kind'], { bg: string; icon: string }> = {
  follow: { bg: '#1D4ED8', icon: '+' },
  case_like: { bg: '#DC2626', icon: '♥' },
  case_comment: { bg: '#0D9488', icon: '✎' },
  post_reply: { bg: '#0D9488', icon: '✎' },
  helpful: { bg: '#D97706', icon: '★' },
}

export function alertWhen(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

export default function AlertLine({ item, first, compact, onClick }: { item: AlertLineItem; first?: boolean; compact?: boolean; onClick?: () => void }) {
  const b = BADGE[item.kind]
  const stack = item.actors.slice(0, item.count > 1 ? 2 : 1)
  return (
    <Link href={item.href} onClick={onClick}
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: compact ? '10px 0' : '12px 14px', borderTop: first ? 'none' : '1px solid #E2E8F0', textDecoration: 'none', color: '#0F1923', background: !compact && item.unseen ? '#EFF6FF' : 'transparent' }}>
      <span style={{ position: 'relative', flex: 'none', display: 'inline-flex' }}>
        {stack.map((a, i) => (
          <span key={a.id} style={{ marginLeft: i ? -12 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px #fff', display: 'inline-flex' }}>
            <Avatar name={a.name} photo={a.photo} size={stack.length > 1 ? 30 : 36} />
          </span>
        ))}
        <span aria-hidden="true" style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: '50%', background: b.bg, color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{b.icon}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.45 }}>
        <span>{item.text}</span>
        {item.snippet && <span style={{ display: 'block', color: '#475569', marginTop: 2 }}>&ldquo;{item.snippet}&rdquo;</span>}
        <span style={{ display: 'block', fontSize: 12, color: '#64748B', marginTop: 2 }}>{alertWhen(item.at)}</span>
      </span>
      {item.unseen && <span aria-label="New" style={{ width: 9, height: 9, borderRadius: '50%', background: '#1D4ED8', flex: 'none', marginTop: 6 }} />}
    </Link>
  )
}
