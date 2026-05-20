import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from '@/components/national/NationalShell'
import { CITY_CONFIGS } from '@/config/cities'
import { getSpecialty } from '@/lib/dentalSpecialties'
import { buildFeedFor, type FeedCase } from '@/lib/feed'
import FeedLastSeen from './FeedLastSeen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'My Feed | Dentist In India',
  robots: { index: false, follow: false },
}

// /feed — three-column layout (sidebar / main / sidebar) for the
// signed-in dentist's professional network feed. Server-rendered;
// nothing on this page needs client-side state except the last-seen
// localStorage stamp, which a small client component handles.

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login?next=/feed')

  const { data: me } = await supabase
    .from('dentists')
    .select('id, slug, name, city, clinic_name, profile_photo, is_verified, experience_years')
    .eq('email', user.email)
    .single()
  if (!me) redirect('/for-dentists/register')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Three fetches in parallel: the feed itself, my follower/following
  // counts, and who-to-follow suggestions.
  const [feedRes, { count: followerCount }, { count: followingCountRaw }, { data: suggestionsRaw }] = await Promise.all([
    buildFeedFor(admin, me.id),
    admin.from('dentist_follows').select('*', { count: 'exact', head: true }).eq('following_id', me.id),
    admin.from('dentist_follows').select('*', { count: 'exact', head: true }).eq('follower_id', me.id),
    // "Top dentists by case count, excluding me and people I follow"
    admin.from('dentists')
      .select('id, slug, name, city, profile_photo')
      .eq('is_active', true).neq('id', me.id)
      .limit(60),
  ])
  const followingCount = followingCountRaw || 0

  // Filter suggestion set + compute their case counts. Cheap because
  // we limit the pool to 60 candidates before fanning out.
  const followingIds = new Set<string>()
  if (feedRes.followingCount > 0) {
    const { data: f } = await admin
      .from('dentist_follows').select('following_id').eq('follower_id', me.id)
    for (const row of (f || []) as Array<{ following_id: string }>) followingIds.add(row.following_id)
  }
  const suggestionsPool = (suggestionsRaw || []).filter((d: any) => !followingIds.has(d.id))
  const suggestionIds = suggestionsPool.map((d: any) => d.id as string)
  const caseCounts = new Map<string, number>()
  if (suggestionIds.length) {
    const { data: cs } = await admin
      .from('cases').select('dentist_id').in('dentist_id', suggestionIds).eq('status', 'approved')
    for (const c of (cs || []) as Array<{ dentist_id: string }>) {
      caseCounts.set(c.dentist_id, (caseCounts.get(c.dentist_id) || 0) + 1)
    }
  }
  const suggestions = suggestionsPool
    .map((d: any) => ({ ...d, case_count: caseCounts.get(d.id) || 0 }))
    .sort((a: any, b: any) => b.case_count - a.case_count)
    .slice(0, 6)

  const myCityCfg = me.city ? (CITY_CONFIGS as any)[me.city] : null
  const myInitials = me.name.split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  // The newest case's created_at is what the FeedLastSeen client uses
  // to compute "you have N new cases since last visit" on the nav
  // notification dot. We pass it down to a small client island.
  const newestCaseAt = feedRes.cases[0]?.created_at || null

  return (
    <NationalShell badge="Feed">
      <FeedLastSeen newestCaseAt={newestCaseAt} />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 280px', gap: 20, alignItems: 'start' }}>
          {/* Left sidebar */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', overflow: 'hidden' }}>
                {me.profile_photo ? <img src={me.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : myInitials}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#0F1923' }}>Dr. {me.name}</div>
              {myCityCfg && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{myCityCfg.cityName}</div>}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 10, fontSize: 11, color: '#475569' }}>
                <span><strong style={{ color: '#0F1923' }}>{followerCount ?? 0}</strong> followers</span>
                <span><strong style={{ color: '#0F1923' }}>{followingCount}</strong> following</span>
              </div>
              <Link href={`/professional/${me.slug}`} style={{ display: 'inline-block', marginTop: 14, fontSize: 12, color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>View my profile →</Link>
            </div>
            <nav style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SideLink href={`/professional/${me.slug}`}>🩺 My cases</SideLink>
              <SideLink href="/cases/saved">★ Saved cases</SideLink>
              <SideLink href="/cases/new">+ Post a case</SideLink>
              <SideLink href="/dentists">👥 Discover dentists</SideLink>
            </nav>
          </aside>

          {/* Main feed */}
          <section>
            <header style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: '#0F1923' }}>
                {feedRes.source === 'following' ? 'My feed' : 'Trending cases'}
              </h1>
              {feedRes.source === 'trending' && (
                <span style={{ fontSize: 12, color: '#94A3B8' }}>You're not following anyone yet — showing trending cases instead.</span>
              )}
            </header>
            {feedRes.cases.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 40, textAlign: 'center', color: '#64748B' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F1923', marginBottom: 6 }}>Nothing in your feed yet.</p>
                <p style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <Link href="/dentists" style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>Discover dentists to follow →</Link>
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {feedRes.cases.map(c => <FeedItem key={c.id} c={c} />)}
              </ul>
            )}
          </section>

          {/* Right sidebar */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 80 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, color: '#0F1923', marginBottom: 10 }}>Who to follow</h3>
              {suggestions.length === 0 ? (
                <p style={{ fontSize: 12, color: '#94A3B8' }}>You're following everyone we know.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {suggestions.map((s: any) => {
                    const cfg = s.city ? (CITY_CONFIGS as any)[s.city] : null
                    const initials = s.name.split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                    return (
                      <li key={s.id}>
                        <Link href={`/professional/${s.slug}`} style={{ display: 'flex', gap: 10, alignItems: 'center', textDecoration: 'none', color: '#0F1923' }}>
                          <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {s.profile_photo ? <img src={s.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. {s.name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{cfg?.cityName || '—'} · {s.case_count} case{s.case_count === 1 ? '' : 's'}</div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>

      <style>{`
        @media (max-width: 960px) {
          main > div { grid-template-columns: 1fr !important; }
          main aside { position: static !important; }
        }
      `}</style>
    </NationalShell>
  )
}

function FeedItem({ c }: { c: FeedCase }) {
  const spec = getSpecialty(c.specialty)
  const cfg = c.dentist?.city ? (CITY_CONFIGS as any)[c.dentist.city] : null
  const initials = c.dentist?.name?.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'D'
  return (
    <li style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {c.dentist?.profile_photo ? <img src={c.dentist.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {c.dentist?.slug
              ? <a href={`/professional/${c.dentist.slug}`} style={{ fontSize: 14, fontWeight: 700, color: '#0F1923', textDecoration: 'none' }}>Dr. {c.dentist.name}</a>
              : <span style={{ fontSize: 14, fontWeight: 700 }}>Dr. {c.dentist?.name || 'Unknown'}</span>}
            {c.dentist?.is_verified && <span style={{ fontSize: 10, padding: '1px 6px', background: '#DCFCE7', color: '#166534', borderRadius: 999, fontWeight: 700 }}>✓</span>}
            {cfg && <span style={{ fontSize: 11, color: '#94A3B8' }}>· {cfg.cityName}</span>}
            {spec && <span style={{ fontSize: 11, color: '#94A3B8' }}>· {spec.label}</span>}
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
      </div>
      <a href={`/cases/${c.id}`} style={{ textDecoration: 'none', color: '#0F1923', display: 'block' }}>
        {c.thumb && (
          <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#F1F5F9', overflow: 'hidden' }}>
            <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          </div>
        )}
        <div style={{ padding: '14px 18px' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0F1923', lineHeight: 1.35 }}>{c.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, fontSize: 11, color: '#94A3B8' }}>
            <span>♥ {c.like_count}</span>
            <span>💬 {c.comment_count}</span>
            <span>👁 {c.view_count}</span>
          </div>
        </div>
      </a>
    </li>
  )
}

function SideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ display: 'block', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
      {children}
    </Link>
  )
}
