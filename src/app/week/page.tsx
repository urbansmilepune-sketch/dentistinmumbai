import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import FollowButton from '@/components/national/FollowButton'
import Avatar from '@/components/national/home/Avatar'
import WeekCard from '@/components/national/home/WeekCard'
import { adminDb, getViewerDentist, isNationalRequest } from '@/lib/national'
import { touchNetworkSeen } from '@/lib/networkAlerts'
import { getOrCreateInviteCode, loadInviteStats } from '@/lib/invites'
import { inviteMessage, loadWeek, type WeekPerson } from '@/lib/weeklyActivity'
import { NATIONAL_ORIGIN } from '@/config/cities'

// dentistinindia.in/week (27 Nov 2026): the full "Your week" — the same
// card as the home page, then everyone who viewed your cases, followed
// you, liked and replied in the last 7 days, with one-tap follow back.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Your week | DentistIn India',
  robots: { index: false, follow: false },
}

const TABS = [
  { key: 'viewed', label: 'Viewed' },
  { key: 'followed', label: 'Followed' },
  { key: 'liked', label: 'Liked' },
  { key: 'replied', label: 'Replied' },
] as const
type TabKey = typeof TABS[number]['key']

function ago(iso: string): string {
  const h = Math.floor((Date.now() - Date.parse(iso)) / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  if (!(await isNationalRequest())) redirect('/api/auth/india-handoff?next=week')
  const viewer = await getViewerDentist()
  if (!viewer) redirect('/for-dentists/login?next=%2Fweek')
  if (!viewer.is_active) notFound()
  const sp = await searchParams

  const db = adminDb()
  const [week, code] = await Promise.all([loadWeek(viewer.id, db), getOrCreateInviteCode(viewer.id)])
  const invite = code ? await loadInviteStats(viewer.id, code) : null
  const inviteLink = code ? `${NATIONAL_ORIGIN}/invite/${code}` : null
  await touchNetworkSeen(viewer.id, db)

  const lists: Record<TabKey, WeekPerson[]> = {
    viewed: week.viewers, followed: week.followers, liked: week.likers, replied: week.repliers,
  }
  const counts: Record<TabKey, number> = {
    viewed: week.viewers.length + week.privateViewers, followed: week.now.followers, liked: week.now.likes, replied: week.now.replies,
  }
  const asked = String(sp.tab || '') as TabKey
  const tab: TabKey = TABS.some(t => t.key === asked) ? asked : (TABS.find(t => counts[t.key] > 0)?.key ?? 'viewed')
  const people = lists[tab]

  // Follow state for the people listed.
  const ids = Array.from(new Set(Object.values(lists).flat().map(p => p.id)))
  const iFollow = new Set<string>(), followsMe = new Set<string>()
  if (ids.length) {
    const [a, b] = await Promise.all([
      db.from('dentist_follows').select('following_id').eq('follower_id', viewer.id).in('following_id', ids),
      db.from('dentist_follows').select('follower_id').eq('following_id', viewer.id).in('follower_id', ids),
    ])
    for (const r of (a.data || []) as Array<{ following_id: string }>) iFollow.add(r.following_id)
    for (const r of (b.data || []) as Array<{ follower_id: string }>) followsMe.add(r.follower_id)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '4px 14px' }
  const empty: Record<TabKey, string> = {
    viewed: 'No dentist has opened your cases in the last 7 days yet. Posting a case is the quickest way to change that.',
    followed: 'No new followers in the last 7 days.',
    liked: 'No likes in the last 7 days.',
    replied: 'No replies in the last 7 days.',
  }

  return (
    <NationalShell badge="Your week">
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ flex: 1, margin: 0, fontFamily: 'var(--font-heading)', fontSize: 24, color: '#0F1923' }}>Your week</h1>
          <span style={{ fontSize: 13, color: '#64748B' }}>{week.label}</span>
        </div>

        <WeekCard week={week} dentistId={viewer.id} inviteLink={inviteLink}
          inviteMessage={inviteLink ? inviteMessage(week, inviteLink) : ''} joined={invite?.joined ?? 0} onWeekPage />

        <nav aria-label="Activity" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {TABS.map(t => {
            const on = t.key === tab
            return (
              <Link key={t.key} href={`/week?tab=${t.key}`} aria-current={on ? 'page' : undefined} scroll={false}
                style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
                  background: on ? '#0B1B33' : '#fff', color: on ? '#fff' : '#334155', border: on ? '1px solid #0B1B33' : '1px solid #E2E8F0' }}>
                {t.label} {counts[t.key]}
              </Link>
            )
          })}
        </nav>

        <div style={card}>
          {people.length === 0 && !(tab === 'viewed' && week.privateViewers > 0) && (
            <p style={{ margin: '12px 0', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>{empty[tab]}</p>
          )}
          {people.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid #E2E8F0' : 'none' }}>
              <Link href={`/professional/${p.slug}`} aria-label={p.name} style={{ display: 'inline-flex' }}><Avatar name={p.name} photo={p.photo} size={42} /></Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/professional/${p.slug}`} style={{ display: 'block', fontWeight: 700, fontSize: 14.5, color: '#0F1923', textDecoration: 'none' }}>{p.name}</Link>
                {p.line && <div style={{ fontSize: 12.5, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.line}</div>}
                {p.caseTitle && p.caseHref && (
                  <Link href={p.caseHref} style={{ display: 'block', fontSize: 12.5, color: '#1D4ED8', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tab === 'viewed' ? 'Viewed' : tab === 'liked' ? 'Liked' : 'On'} &ldquo;{p.caseTitle}&rdquo; · {ago(p.at)}
                  </Link>
                )}
                {p.snippet && <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>&ldquo;{p.snippet}&rdquo;</div>}
                {!p.caseTitle && <div style={{ fontSize: 12, color: '#64748B' }}>{ago(p.at)}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
                {iFollow.has(p.id)
                  ? <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#ECFDF5', color: '#0F766E' }}>Following</span>
                  : <FollowButton slug={p.slug} initialFollowing={false} compact />}
                {followsMe.has(p.id) && tab !== 'followed' && <span style={{ fontSize: 11.5, color: '#64748B' }}>Follows you</span>}
              </div>
            </div>
          ))}
          {tab === 'viewed' && week.privateViewers > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#475569' }}>
              <b style={{ color: '#0F1923' }}>{week.privateViewers} {people.length ? 'more ' : ''}dentist{week.privateViewers === 1 ? '' : 's'}</b> viewed privately
            </div>
          )}
        </div>

        {week.topCase && (
          <p style={{ margin: 0, fontSize: 13, color: '#64748B', textAlign: 'center' }}>
            Best case this week: <Link href={week.topCase.href} style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' }}>{week.topCase.title}</Link> · {week.topCase.views} view{week.topCase.views === 1 ? '' : 's'}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 12.5, color: '#64748B', textAlign: 'center' }}>
          Views count once per dentist per case per day. Want to view cases without your name showing? Turn off &ldquo;Show my name when I view a case&rdquo; in <Link href="/alerts#settings" style={{ color: '#1D4ED8' }}>Alert settings</Link>.
        </p>
      </main>
    </NationalShell>
  )
}
