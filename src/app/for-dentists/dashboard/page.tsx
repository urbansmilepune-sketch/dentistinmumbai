import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TodayWhatsAppButton, { type TodayAppt } from './TodayWhatsAppButton'
import AutoRefresh from '@/components/AutoRefresh'
import RecentApptActions from './RecentApptActions'
import ProfileQRCard from './ProfileQRCard'
import RequestReviewCard from './RequestReviewCard'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { getCityBySlug } from '@/config/cities'
import { completionPct } from '@/lib/profileCompletion'
import { NAVY, TEAL, TEAL_DARK, TEAL_SOFT, BRAND_GRADIENT } from '@/app/dentist/[slug]/profileTheme'
import GrowthTools from './GrowthTools'
import { PlusIcon, CalendarIcon, QrIcon, StarIcon, PenIcon, BadgeIcon, ChevronIcon } from './dashIcons'

export const dynamic = 'force-dynamic'

const IST_TZ = 'Asia/Kolkata'
const D = '/for-dentists/dashboard'

function istTodayIso(): string {
  // en-CA locale returns YYYY-MM-DD which is what Postgres `date` columns expect.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function istTodayLabel(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ, weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())
}

function istMonthLabel(): string {
  return `1 ${new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, month: 'long' }).format(new Date())}`
}

function formatTimeLabel(slot: string | null | undefined): string {
  if (!slot) return '—'
  const [hStr, mStr] = slot.split(':')
  const h = Number(hStr); const m = Number(mStr)
  if (isNaN(h)) return slot
  const hour12 = ((h + 11) % 12) + 1
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'no_show'])

const STATUS_PILL: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  confirmed: { bg: '#E0F2FE', text: '#075985', label: 'Confirmed' },
  completed: { bg: '#DCFCE7', text: '#166534', label: 'Done' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled' },
  no_show:   { bg: '#F1F5F9', text: '#475569', label: 'No-show' },
}

type Appt = {
  id: string; patient_name: string | null; patient_phone: string | null;
  appt_date: string; time_slot: string | null; status: string;
  treatments: { name: string | null } | null;
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/for-dentists/login')

  const dentist = await resolveCurrentDentist<any>(
    supabase,
    'id, name, clinic_name, slug, city, tier, is_verified, profile_photo, cover_photo, bio, phone, whatsapp, working_hours, maps_embed, consultation_fee, created_at',
  )

  if (!dentist) redirect('/for-dentists/login')

  const todayIso = istTodayIso()
  const todayLabel = istTodayLabel()
  const clinicName = (dentist as any).clinic_name || dentist.name || ''
  const dentistCity = getCityBySlug((dentist as any).city)
  // Public profile URL for the QR card / review request / badge, on the
  // dentist's own city domain (never a hardcoded host).
  const profileUrl = dentist.slug ? `https://${dentistCity.domain}/dentist/${dentist.slug}` : ''

  // Start of the current calendar month, for the "this month" numbers.
  const _ms = new Date()
  _ms.setUTCDate(1); _ms.setUTCHours(0, 0, 0, 0)
  const monthStartIso = _ms.toISOString()

  // analytics_events RLS blocks the dentist role from reading its own rows,
  // so the month counts use the service-role client. Every query is pinned
  // to the auth-resolved dentist id above.
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  // head:true counts (not row fetches) so busy profiles are not capped at
  // PostgREST's 1000-row limit.
  const countEvent = (eventType: string) => adminClient
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('dentist_id', dentist.id)
    .eq('event_type', eventType)
    .gte('created_at', monthStartIso)

  const [
    { count: reviewCount },
    { data: todayAppts },
    { data: pendingAppts },
    { count: pendingTotal },
    { data: unpaidInvoices },
    { count: monthViews },
    { count: monthWhatsApp },
    { count: monthCalls },
    { count: monthBookTaps },
    { count: articleCount },
  ] = await Promise.all([
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved'),
    supabase
      .from('appointments')
      .select('id, patient_name, patient_phone, appt_date, time_slot, status, treatments(name)')
      .eq('dentist_id', dentist.id)
      .eq('appt_date', todayIso)
      .order('time_slot', { ascending: true }),
    // Booking requests waiting for a reply, soonest first.
    supabase
      .from('appointments')
      .select('id, patient_name, patient_phone, appt_date, time_slot, status, treatments(name)')
      .eq('dentist_id', dentist.id)
      .eq('status', 'pending')
      .gte('appt_date', todayIso)
      .order('appt_date', { ascending: true })
      .order('time_slot', { ascending: true })
      .limit(5),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'pending').gte('appt_date', todayIso),
    supabase
      .from('invoices')
      .select('total, payment_status')
      .eq('dentist_id', dentist.id)
      .in('payment_status', ['pending', 'overdue']),
    countEvent('profile_view'),
    countEvent('whatsapp_click'),
    countEvent('call_click'),
    countEvent('booking_click'),
    supabase.from('dentist_articles').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'published'),
  ])

  const todayList = ((todayAppts ?? []) as unknown) as Appt[]
  const pendingList = ((pendingAppts ?? []) as unknown) as Appt[]
  const totalToday = todayList.filter(a => a.status !== 'cancelled').length

  // New vs follow-up: a patient is a follow-up if the same phone had an
  // earlier appointment. Only today's phones are checked, so this stays a
  // small query however large the clinic's history is.
  const todayPhones = Array.from(new Set(todayList.map(a => a.patient_phone).filter(Boolean))) as string[]
  let priorPhoneSet = new Set<string>()
  if (todayPhones.length > 0) {
    const { data: prior } = await supabase
      .from('appointments')
      .select('patient_phone')
      .eq('dentist_id', dentist.id)
      .lt('appt_date', todayIso)
      .in('patient_phone', todayPhones)
    priorPhoneSet = new Set(((prior ?? []) as Array<{ patient_phone: string | null }>).map(r => r.patient_phone || '').filter(Boolean))
  }
  let newCount = 0
  let followUpCount = 0
  for (const a of todayList) {
    if (a.status === 'cancelled') continue
    if (a.patient_phone && priorPhoneSet.has(a.patient_phone)) followUpCount++
    else newCount++
  }

  // Next patient: earliest open slot after "now" (IST), else earliest open slot.
  const nowHm = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const open = todayList
    .filter(a => !CLOSED_STATUSES.has(a.status))
    .sort((a, b) => (a.time_slot ?? '').localeCompare(b.time_slot ?? ''))
  const nextAppt = open.find(a => (a.time_slot ?? '') > nowHm) || open[0] || null
  const doneCount = todayList.filter(a => a.status === 'completed').length

  const pendingDue = ((unpaidInvoices ?? []) as Array<{ total: number | null }>)
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0)

  const todayApptsForMsg: TodayAppt[] = todayList.map(a => ({
    time_slot: a.time_slot,
    patient_name: a.patient_name,
    treatment: a.treatments?.name ?? null,
    status: a.status,
  }))

  // Profile completeness: same scoring as the sidebar / admin (profileCompletion.ts).
  // The "next step" link points at the first missing basic.
  const pct = completionPct(dentist as any)
  const nextStep =
    !dentist.profile_photo ? { label: 'Add your photo', href: `${D}/photos` }
    : !dentist.cover_photo ? { label: 'Add clinic photos', href: `${D}/photos` }
    : !(dentist.bio && dentist.bio.length >= 50) ? { label: 'Write a longer bio', href: `${D}/profile` }
    : !dentist.whatsapp ? { label: 'Add your WhatsApp number', href: `${D}/profile` }
    : !dentist.maps_embed ? { label: 'Add your Google Maps location', href: `${D}/profile` }
    : { label: 'Finish your profile', href: `${D}/profile` }

  const badgeHtml = `<!-- DentistIn Verified Badge -->
<a href="${profileUrl}"
   target="_blank" rel="noopener"
   style="display:inline-block;text-decoration:none;">
  <div style="display:inline-flex;align-items:center;gap:10px;
              background:#0F172A;color:#ffffff;
              padding:10px 16px;border-radius:10px;
              font-family:Arial,sans-serif;font-size:13px;
              border:1px solid #1E293B;">
    <span style="font-size:20px;">🦷</span>
    <div>
      <div style="font-weight:700;font-size:13px;">
        Verified on DentistIn ${dentistCity.cityName}
      </div>
      <div style="font-size:11px;color:#94A3B8;margin-top:1px;">
        View profile & book online →
      </div>
    </div>
  </div>
</a>`

  const firstName = (dentist.name || '').replace(/^\s*dr\.?\s*/i, '').split(' ')[0]
  const initials = (dentist.name || 'D').replace(/^\s*dr\.?\s*/i, '').split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const contactTaps = (monthWhatsApp ?? 0) + (monthCalls ?? 0)

  // ── Shared styles ────────────────────────────────────────────────
  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }
  const cardHead: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', gap: 8 }
  const h3: React.CSSProperties = { fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }
  const headLink: React.CSSProperties = { color: TEAL_DARK, fontWeight: 700, fontSize: 13, textDecoration: 'none' }
  const rowIcon: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, background: TEAL_SOFT, color: TEAL_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  const chev = <span style={{ color: '#94A3B8', display: 'flex' }}><ChevronIcon /></span>

  // ── Blocks ───────────────────────────────────────────────────────
  const header = (
    <div className="dh-top" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: BRAND_GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, flexShrink: 0, overflow: 'hidden' }}>
        {dentist.profile_photo ? <img src={dentist.profile_photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
      </div>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, lineHeight: 1.2, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clinicName}</h1>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {firstName ? `Dr. ${firstName}` : ''}{firstName ? ' · ' : ''}
          {dentist.is_verified
            ? <span style={{ color: TEAL_DARK, fontWeight: 700 }}>Verified</span>
            : <span style={{ color: '#B45309', fontWeight: 700 }}>Verification pending</span>}
        </div>
      </div>
      <div className="dh-desktop-actions" style={{ display: 'flex', gap: 10 }}>{primaryActions(true)}</div>
      <AutoRefresh />
    </div>
  )

  function primaryActions(compact: boolean) {
    const base: React.CSSProperties = {
      height: compact ? 48 : 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', padding: '0 16px',
    }
    return (
      <>
        <Link href={`${D}/patients?new=1`} style={{ ...base, background: TEAL, color: '#fff' }}>
          <PlusIcon /> Walk-in patient
        </Link>
        <Link href={`${D}/appointments?new=1`} style={{ ...base, background: '#fff', color: 'var(--text)', border: '1.5px solid var(--border)' }}>
          <CalendarIcon size={18} /> Book appointment
        </Link>
      </>
    )
  }

  const setupBar = pct < 100 && (
    <div style={{ ...card, padding: '12px 16px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 8 }}>
        <b>Profile {pct}% complete</b>
        <Link href={nextStep.href} style={headLink}>{nextStep.label}</Link>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: TEAL, borderRadius: 3 }} />
      </div>
    </div>
  )

  const todayCard = (
    <section className="dh-today" style={{ background: NAVY, color: '#fff', borderRadius: 18, padding: 18, display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>{todayLabel}</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 800, lineHeight: 1.15, margin: 0 }}>
          {totalToday === 0 ? 'No patients booked today' : `${totalToday} ${totalToday === 1 ? 'patient' : 'patients'} today`}
        </h2>
      </div>
      {nextAppt ? (
        <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: TEAL, whiteSpace: 'nowrap' }}>{formatTimeLabel(nextAppt.time_slot)}</div>
          <div style={{ fontSize: 13, minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Next: {nextAppt.patient_name || 'Patient'}</div>
            {nextAppt.treatments?.name && <div style={{ opacity: 0.7, fontSize: 12 }}>{nextAppt.treatments.name}</div>}
          </div>
        </div>
      ) : totalToday > 0 ? (
        <div style={{ fontSize: 13, opacity: 0.8 }}>All of today&apos;s appointments are done.</div>
      ) : null}
      <div className="dh-minis" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          <b style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 15, whiteSpace: 'nowrap' }}>{newCount} new · {followUpCount} follow-up</b>
          patient mix
        </div>
        <Link href={`${D}/billing`} style={{ fontSize: 12, opacity: 0.85, color: '#fff', textDecoration: 'none' }}>
          <b style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 15 }}>₹{pendingDue.toLocaleString('en-IN')}</b>
          {pendingDue === 0 ? 'all bills paid' : 'unpaid bills'}
        </Link>
        <div className="dh-desktop-only" style={{ fontSize: 12, opacity: 0.85 }}>
          <b style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 15 }}>{doneCount} done · {Math.max(totalToday - doneCount, 0)} left</b>
          today so far
        </div>
      </div>
      {totalToday > 0 && (
        <TodayWhatsAppButton
          dateLabel={todayLabel}
          clinicName={clinicName}
          total={totalToday}
          newCount={newCount}
          followUpCount={followUpCount}
          nextAppt={nextAppt ? { time_slot: nextAppt.time_slot, patient_name: nextAppt.patient_name } : null}
          pendingDue={pendingDue}
          appts={todayApptsForMsg}
        />
      )}
    </section>
  )

  const needsReply = pendingList.length > 0 && (
    <section style={card}>
      <div style={cardHead}>
        <h3 style={h3}>
          Needs your reply
          <span style={{ background: '#FEE2E2', color: '#991B1B', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '1px 8px' }}>{pendingTotal ?? pendingList.length}</span>
        </h3>
        {(pendingTotal ?? 0) > pendingList.length && <Link href={`${D}/appointments?status=pending`} style={headLink}>See all</Link>}
      </div>
      <div className="dh-reqs" style={{ display: 'grid' }}>
        {pendingList.map(a => (
          <div key={a.id} style={{ borderTop: '1px solid var(--border)', borderLeft: '4px solid #F59E0B', padding: '12px 16px', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>{a.patient_name || 'Patient'}</b>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#FEF3C7', color: '#92400E', whiteSpace: 'nowrap' }}>New booking</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {[formatDateLabel(a.appt_date), formatTimeLabel(a.time_slot), a.treatments?.name].filter(Boolean).join(' · ')}
            </div>
            <RecentApptActions appointmentId={a.id} status={a.status} variant="large" />
          </div>
        ))}
      </div>
    </section>
  )

  const todayListCard = (
    <section style={card}>
      <div style={cardHead}>
        <h3 style={h3}>Today</h3>
        <Link href={`${D}/appointments`} style={headLink}>See all</Link>
      </div>
      {todayList.length === 0 ? (
        <div style={{ borderTop: '1px solid var(--border)', padding: '18px 16px', fontSize: 13, color: 'var(--muted)' }}>
          No appointments today. Share your profile QR at the front desk so patients can book you directly.
        </div>
      ) : todayList.map(a => {
        const pill = STATUS_PILL[a.status] || { bg: '#F1F5F9', text: '#475569', label: a.status }
        const faded = CLOSED_STATUSES.has(a.status)
        return (
          <Link key={a.id} href={`${D}/appointments`} style={{ borderTop: '1px solid var(--border)', padding: '11px 16px', display: 'grid', gridTemplateColumns: '74px 1fr auto', gap: 10, alignItems: 'center', textDecoration: 'none', color: 'var(--text)', opacity: faded ? 0.55 : 1 }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatTimeLabel(a.time_slot)}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.patient_name || 'Patient'}</b>
              {a.treatments?.name && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.treatments.name}</span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: pill.bg, color: pill.text, whiteSpace: 'nowrap' }}>{pill.label}</span>
          </Link>
        )
      })}
    </section>
  )

  const monthCard = (
    <section style={card}>
      <div style={cardHead}>
        <h3 style={h3}>DentistIn this month</h3>
        <Link href={`${D}/analytics`} style={headLink}>Details</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--border)' }}>
        {[
          { value: monthViews ?? 0, label: 'people saw your profile' },
          { value: contactTaps, label: 'tapped Call or WhatsApp' },
          { value: monthBookTaps ?? 0, label: 'tapped Book online' },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '12px 8px', textAlign: 'center', borderLeft: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <b style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.value.toLocaleString('en-IN')}</b>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', lineHeight: 1.25 }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
        Counted from {istMonthLabel()}.
      </div>
    </section>
  )

  // "Get more patients": one list. Rows that hold a tool (QR, review
  // request, badge) open in place with <details>, so the home page stays
  // short until the dentist asks for the tool.
  const growRow = (icon: React.ReactNode, title: string, sub: string) => (
    <>
      <span style={rowIcon}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 14 }}>{title}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </span>
      {chev}
    </>
  )
  const rowStyle: React.CSSProperties = { borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--text)', cursor: 'pointer', listStyle: 'none' }

  const growCard = (
    <section style={card}>
      <div style={cardHead}><h3 style={h3}>Get more patients</h3></div>
      {profileUrl && (
        <details className="dh-grow">
          <summary style={rowStyle}>{growRow(<QrIcon />, 'Share your profile', 'QR code for your reception desk')}</summary>
          <div style={{ padding: '0 12px 4px' }}><ProfileQRCard profileUrl={profileUrl} clinicName={clinicName} /></div>
        </details>
      )}
      {!reviewCount && profileUrl && (
        <details className="dh-grow">
          <summary style={rowStyle}>{growRow(<StarIcon />, 'Ask for your first review', 'Send a WhatsApp to a happy patient')}</summary>
          <div style={{ padding: '0 12px 4px' }}><RequestReviewCard profileUrl={profileUrl} clinicName={clinicName} dentistName={dentist.name || ''} /></div>
        </details>
      )}
      <Link href={articleCount ? `${D}/articles` : `${D}/articles/new`} style={rowStyle}>
        {growRow(<PenIcon />, articleCount ? `Your articles (${articleCount} published)` : 'Write an article', `Shows on DentistIn ${dentistCity.cityName} and DentistIn India`)}
      </Link>
      {profileUrl && (
        <details className="dh-grow">
          <summary style={rowStyle}>{growRow(<BadgeIcon />, 'Website badge and Google link', 'Get bookings from your own website')}</summary>
          <div style={{ padding: '0 16px 16px' }}><GrowthTools badgeHtml={badgeHtml} profileUrl={profileUrl} cityName={dentistCity.cityName} /></div>
        </details>
      )}
    </section>
  )

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 16 }}>
      {header}
      <div className="dh-mobile-actions" style={{ display: 'none', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{primaryActions(false)}</div>
      <div className="dh-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {setupBar}
          {todayCard}
          {needsReply}
          {todayListCard}
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {monthCard}
          {growCard}
        </div>
      </div>

      <style>{`
        .dh-grow > summary::-webkit-details-marker { display: none; }
        .dh-grow[open] > summary svg:last-child { transform: rotate(90deg); }
        .dh-grow section { margin-bottom: 12px !important; box-shadow: none !important; }
        .dh-reqs { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .dh-minis { grid-template-columns: 1fr 1fr 1fr !important; }
        @media (max-width: 900px) {
          .dh-cols { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 768px) {
          .dh-desktop-actions { display: none !important; }
          .dh-mobile-actions { display: grid !important; }
          .dh-desktop-only { display: none !important; }
          .dh-minis { grid-template-columns: 1fr 1fr !important; }
          .dh-mobile-actions a { padding: 0 8px !important; font-size: 13.5px !important; }
        }
      `}</style>
    </div>
  )
}
