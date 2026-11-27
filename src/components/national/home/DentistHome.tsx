import Link from 'next/link'
import NationalShell from '../NationalShell'
import FollowButton from '../FollowButton'
import InviteBox from '../InviteBox'
import Avatar from './Avatar'
import ClinicLink from './ClinicLink'
import HomeColumns from './HomeColumns'
import PostComposer from './PostComposer'
import Feed from './Feed'
import WeekCard from './WeekCard'
import FirstCaseCard from './FirstCaseCard'
import { getOrCreateInviteCode, loadInviteStats } from '@/lib/invites'
import { inviteMessage, loadWeek, weekCardHidden } from '@/lib/weeklyActivity'
import { NATIONAL_ORIGIN } from '@/config/cities'
import { getSpecialty } from '@/lib/dentalSpecialties'
import type { DentistHomeData } from '@/lib/dentistHome'

// Signed-in dentist home on dentistinindia.in (Ashish's sketch, approved
// 26 Nov 2026): profile on the left, Post wall + community feed in the
// middle, Manage my clinic + suggestions + city-site status on the right.

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
const h4: React.CSSProperties = { margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#0F1923' }
const sub: React.CSSProperties = { margin: 0, fontSize: 12.5, color: '#64748B' }
const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', color: '#0F1923', fontWeight: 700, fontSize: 13, textDecoration: 'none' }

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default async function DentistHome({ data }: { data: DentistHomeData }) {
  const { me, clinic } = data
  const code = await getOrCreateInviteCode(me.id)
  const invite = code ? await loadInviteStats(me.id, code) : null
  // "Post your first case" card (27 Nov 2026) until the dentist has a case
  // live or in review; it takes the place of the "Your week" card.
  const needsFirstCase = me.liveCases === 0
  // "Your week" card (27 Nov 2026): hidden until next Monday once closed.
  const week = needsFirstCase || (await weekCardHidden(me.id)) ? null : await loadWeek(me.id)
  const inviteLink = code ? `${NATIONAL_ORIGIN}/invite/${code}` : null
  // The "my specialty" feed tab follows the specialty they post most in.
  const topSpec = data.feed.find(it => it.type === 'case' && it.author.id === me.id && it.specialty)
  const spec = topSpec && topSpec.type === 'case' && topSpec.specialty ? getSpecialty(topSpec.specialty) : null

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <nav className="dh-hnav" aria-label="Main" style={{ display: 'flex', gap: 2 }}>
        {[{ href: '/cases', l: 'Cases' }, { href: '/events', l: 'Events' }, { href: '/experts', l: 'Find an expert' }].map(n => (
          <Link key={n.href} href={n.href} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 10px', fontSize: 14, fontWeight: 600, color: '#334155', textDecoration: 'none' }}>{n.l}</Link>
        ))}
      </nav>
      <ClinicLink page="home" label="Manage my clinic" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', borderRadius: 10, background: '#ECFDF5', color: '#0F766E', border: '1px solid #A7F3D0', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12" /><path d="M10 21v-5h4v5M12 8v4M10 10h4" /></svg>
        My clinic
      </ClinicLink>
      <Link href={`/professional/${me.slug}`} aria-label="My public profile" style={{ display: 'inline-flex' }}>
        <Avatar name={me.name} photo={me.photo} size={38} />
      </Link>
    </div>
  )

  const stats = [
    { n: me.cases, l: 'Cases' },
    { n: me.followers, l: 'Followers' },
    { n: me.following, l: 'Following' },
    { n: me.helpful, l: 'Helpful' },
  ]

  const strip = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
      <Avatar name={me.name} photo={me.photo} size={54} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#0F1923' }}>{me.name}</div>
        <div style={{ fontSize: 12.5, color: '#64748B' }}>{me.headline}{me.cityName ? ` · ${me.cityName}` : ''}</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#334155', marginTop: 4, flexWrap: 'wrap' }}>
          <span><strong>{me.cases}</strong> cases</span><span><strong>{me.followers}</strong> followers</span><span><strong>{me.helpful}</strong> helpful</span>
        </div>
      </div>
      <Link href={`/professional/${me.slug}`} style={ghost}>Profile</Link>
    </div>
  )

  const left = (
    <>
      <div style={{ ...card, alignItems: 'center', textAlign: 'center', padding: 20, gap: 14 }}>
        <span style={{ borderRadius: '50%', boxShadow: '0 0 0 4px #fff, 0 0 0 6px #DBEAFE', display: 'inline-flex' }}><Avatar name={me.name} photo={me.photo} size={96} /></span>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 18, color: '#0F1923' }}>{me.name}</h1>
          <div style={{ fontSize: 13.5, color: '#64748B', marginTop: 2 }}>{[me.qualifications, me.cityName].filter(Boolean).join(' · ') || me.headline}</div>
        </div>
        {(me.founding || me.verified) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {me.founding && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#FEF3C7', color: '#78350F' }}>Founding Dentist</span>}
            {me.verified && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#DCFCE7', color: '#166534' }}>Registration verified</span>}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', width: '100%', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', padding: '12px 0' }}>
          {stats.map(s => (
            <div key={s.l}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: '#0F1923', fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>{s.l}</div>
            </div>
          ))}
        </div>
        {me.skills.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {me.skills.map(s => <span key={s} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: '#EFF6FF', color: '#1E3A8A' }}>{s}</span>)}
          </div>
        ) : (
          <Link href="/claim" style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>Pick your top 3 skills →</Link>
        )}
        {me.setup < 100 && (
          <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 8, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{ width: `${me.setup}%`, height: '100%', background: '#1D4ED8', borderRadius: 99 }} />
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#64748B' }}>Profile {me.setup}% done. Finish it from your clinic dashboard.</p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
          <ClinicLink page="profile" style={{ ...ghost, width: '100%' }}>Edit profile</ClinicLink>
          <Link href={`/professional/${me.slug}`} style={ghost}>Public page</Link>
        </div>
      </div>
      {invite && code && (
        <InviteBox dentistId={me.id} code={code} sent={invite.sent} joined={invite.joined}
          recent={invite.recent.slice(0, 3).map(r => ({ name: r.name, slug: r.slug, when: timeAgo(r.created_at) }))} />
      )}
    </>
  )

  const mid = (
    <>
      {needsFirstCase && <FirstCaseCard cityName={me.cityName} />}
      {week && (
        <WeekCard week={week} dentistId={me.id} inviteLink={inviteLink}
          inviteMessage={inviteLink ? inviteMessage(week, inviteLink) : ''} joined={invite?.joined ?? 0} />
      )}
      <PostComposer me={{ name: me.name, photo: me.photo }} enabled={data.postsEnabled} />
      <Feed items={data.feed} meId={me.id} followingIds={data.followingIds}
        specialty={spec ? { slug: spec.slug, label: spec.label } : null} event={data.event} cityName={me.cityName} />
    </>
  )

  const stat = (n: number, l: string) => (
    <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ fontSize: 11.5, color: '#CCFBF1', lineHeight: 1.3 }}>{l}</div>
    </div>
  )
  const quick: React.CSSProperties = { display: 'flex', alignItems: 'center', minHeight: 40, padding: '0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', width: '100%', textAlign: 'left' }
  const statusPill = (text: string, kind: 'ok' | 'todo' | 'num') => (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      ...(kind === 'ok' ? { background: '#DCFCE7', color: '#166534' } : kind === 'todo' ? { background: '#FEF3C7', color: '#78350F' } : { background: '#F8FAFC', color: '#0F1923', border: '1px solid #E2E8F0' }) }}>{text}</span>
  )
  const row = (label: string, right: React.ReactNode, first = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: first ? 'none' : '1px solid #E2E8F0', fontSize: 13.5, color: '#0F1923' }}>
      <span>{label}</span>{right}
    </div>
  )

  const right = (
    <>
      <section style={{ ...card, background: 'linear-gradient(160deg, #0F766E 0%, #115E59 100%)', border: 'none', color: '#fff' }}>
        <div>
          <h2 style={{ ...h4, color: '#fff', fontSize: 16 }}>Manage my clinic</h2>
          <p style={{ ...sub, color: '#CCFBF1' }}>{clinic.domain ? `Your dashboard on ${clinic.domain}` : 'Your clinic dashboard'}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {stat(clinic.today, 'Appointments today')}
          {stat(clinic.requests, 'Booking requests')}
          {stat(clinic.unpaid, 'Unpaid bills')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <ClinicLink page="appointments" style={quick}>Appointments</ClinicLink>
          <ClinicLink page="patients" style={quick}>Patients</ClinicLink>
          <ClinicLink page="billing" style={quick}>Billing</ClinicLink>
          <ClinicLink page="calendar" style={quick}>Calendar</ClinicLink>
        </div>
        <ClinicLink page="home" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 10, background: '#fff', color: '#0F766E', fontWeight: 800, fontSize: 15, border: 'none', width: '100%' }}>
          Open clinic dashboard
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </ClinicLink>
        <div style={{ fontSize: 12, color: '#CCFBF1', textAlign: 'center' }}>Opens already signed in. No second login.</div>
      </section>

      <section style={{ ...card, borderTop: '3px solid #0F766E' }}>
        <div>
          <h2 style={h4}>Community suggestions</h2>
          <p style={sub}>{me.cityName ? `Dentists in ${me.cityName} you may know` : 'Dentists you may know'}</p>
        </div>
        {data.suggestions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>You follow everyone we would suggest right now.</p>
        ) : data.suggestions.map(s => (
          <div key={s.slug} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href={`/professional/${s.slug}`} style={{ display: 'inline-flex' }} aria-label={s.name}><Avatar name={s.name} photo={s.photo} size={38} /></Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/professional/${s.slug}`} style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0F1923', textDecoration: 'none' }}>{s.name}</Link>
              <span style={{ display: 'block', fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.line}</span>
            </div>
            <FollowButton slug={s.slug} initialFollowing={false} compact />
          </div>
        ))}
        <Link href="/experts" style={{ fontSize: 13.5, fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>Find more dentists →</Link>
      </section>

      <section style={{ ...card, borderTop: '3px solid #0F766E', gap: 4 }}>
        <h2 style={h4}>Your clinic website</h2>
        <p style={{ ...sub, marginBottom: 6 }}>{clinic.domain ? `Your page on ${clinic.domain}, where patients book` : 'Your page where patients book'}</p>
        {row('Profile page', statusPill(clinic.live ? 'Live' : 'Hidden', clinic.live ? 'ok' : 'todo'), true)}
        {row('Book button on Google', clinic.googleButton
          ? statusPill('Added', 'ok')
          : <ClinicLink page="google" style={{ border: 'none', background: 'none', padding: 0 }}>{statusPill('Add now', 'todo')}</ClinicLink>)}
        {row('Patient reviews', <ClinicLink page="reviews" style={{ border: 'none', background: 'none', padding: 0 }}>{statusPill(String(clinic.reviews), 'num')}</ClinicLink>)}
        {row('Profile views this month', statusPill(String(clinic.profileViews), 'num'))}
        {row('Profile complete', me.setup >= 100 ? statusPill('100%', 'ok') : <ClinicLink page="profile" style={{ border: 'none', background: 'none', padding: 0 }}>{statusPill(`${me.setup}%`, 'todo')}</ClinicLink>)}
      </section>
    </>
  )

  return (
    <NationalShell hideNav right={header}>
      <HomeColumns strip={strip} left={left} mid={mid} right={right} />
    </NationalShell>
  )
}
