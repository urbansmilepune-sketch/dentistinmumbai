import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TodayWhatsAppButton, { type TodayAppt } from './TodayWhatsAppButton'
import AutoRefresh from '@/components/AutoRefresh'
import RecentApptActions from './RecentApptActions'
import ProfileQRCard from './ProfileQRCard'
import RequestReviewCard from './RequestReviewCard'
import AskReviewButton from './AskReviewButton'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { getCityBySlug } from '@/config/cities'
import { setupSteps, setupPct, isSetupLive } from '@/lib/setupSteps'
import { NAVY, TEAL, TEAL_DARK, TEAL_SOFT, BRAND_GRADIENT } from '@/app/dentist/[slug]/profileTheme'
import GrowthTools from './GrowthTools'
import { PlusIcon, CalendarIcon, QrIcon, StarIcon, BadgeIcon, ChevronIcon, SearchIcon, CheckIcon } from './dashIcons'

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
    'id, name, clinic_name, slug, city, tier, is_verified, profile_photo, cover_photo, bio, phone, whatsapp, working_hours, maps_embed, consultation_fee, mci_number, created_at, avg_rating, review_count',
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

  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: reviewCount },
    { count: weekReviewCount },
    { data: latestReviewRows },
    { data: todayAppts },
    { data: pendingAppts },
    { count: pendingTotal },
    { data: unpaidInvoices },
    { count: monthViews },
    { count: monthWhatsApp },
    { count: monthCalls },
    { count: monthBookTaps },
    { count: articleCount },
    { count: articlePendingCount },
    { data: recentArticleRows },
  ] = await Promise.all([
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved').gte('created_at', weekAgoIso),
    // Newest live review, for the "New review" card (last 14 days only).
    supabase
      .from('reviews')
      .select('id, patient_name, rating, review_text, treatment, created_at')
      .eq('dentist_id', dentist.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1),
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
    supabase.from('dentist_articles').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'pending'),
    // Latest two posts for the "Get found on Google" card.
    supabase
      .from('dentist_articles')
      .select('id, title, status')
      .eq('dentist_id', dentist.id)
      .order('created_at', { ascending: false })
      .limit(2),
  ])

  const todayList = ((todayAppts ?? []) as unknown) as Appt[]

  // Review link status for today's visits marked Done: asked / reviewed.
  const doneIds = todayList.filter(a => a.status === 'completed').map(a => a.id)
  const reviewAsk = new Map<string, 'asked' | 'reviewed'>()
  if (doneIds.length > 0) {
    const { data: asks } = await adminClient
      .from('review_requests')
      .select('appointment_id, used_at')
      .in('appointment_id', doneIds)
    for (const r of (asks ?? []) as Array<{ appointment_id: string; used_at: string | null }>) {
      reviewAsk.set(r.appointment_id, r.used_at ? 'reviewed' : 'asked')
    }
  }

  const latestReview = ((latestReviewRows ?? []) as Array<{ id: string; patient_name: string | null; rating: number; review_text: string | null; treatment: string | null; created_at: string }>)[0]
  const freshReview = latestReview && Date.now() - Date.parse(latestReview.created_at) < 14 * 24 * 60 * 60 * 1000 ? latestReview : null
  const avgRating = Number((dentist as any).avg_rating) || 0
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

  // Setup progress: the same 5 steps as the setup wizard (setupSteps.ts).
  // Steps 1–4 = live (80%), step 5 = 100%. Each row opens that wizard step.
  const steps = setupSteps(dentist as any)
  const pct = setupPct(dentist as any)
  const live = isSetupLive(dentist as any)

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
    <div style={{ ...card, padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, gap: 8 }}>
        <b>{live ? `You're live · ${pct}% complete` : `Go live: ${steps.filter(s => s.neededToGoLive && s.done).length} of 4 done`}</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: TEAL_DARK, background: TEAL_SOFT, borderRadius: 99, padding: '2px 10px', whiteSpace: 'nowrap' }}>{pct}%</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {steps.map(s => <i key={s.step} style={{ display: 'block', height: 6, borderRadius: 99, background: s.done ? TEAL : 'var(--border)' }} />)}
      </div>
      <div style={{ display: 'grid' }}>
        {steps.filter(s => !s.done).map(s => (
          <Link key={s.step} href={`/for-dentists/onboard?step=${s.step}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px dashed var(--border)', fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{s.label}</b>
              {s.neededToGoLive && !live && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 99, padding: '1px 6px' }}>to go live</span>}
            </span>
            <span style={headLink}>Add</span>
          </Link>
        ))}
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
        const ask = a.status === 'completed' ? (reviewAsk.get(a.id) ?? 'none') : null
        return (
          <div key={a.id} style={{ borderTop: '1px solid var(--border)', padding: '11px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
            <Link href={`${D}/appointments`} style={{ display: 'grid', gridTemplateColumns: '74px 1fr auto', gap: 10, alignItems: 'center', textDecoration: 'none', color: 'var(--text)', opacity: faded && !ask ? 0.55 : 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatTimeLabel(a.time_slot)}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.patient_name || 'Patient'}</b>
                {a.treatments?.name && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.treatments.name}</span>}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: pill.bg, color: pill.text, whiteSpace: 'nowrap' }}>{pill.label}</span>
            </Link>
            {ask === 'reviewed' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: TEAL_DARK, whiteSpace: 'nowrap' }}><StarIcon /> Reviewed</span>
            ) : ask === 'asked' ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Review asked</span>
            ) : ask === 'none' ? (
              <AskReviewButton appointmentId={a.id} compact />
            ) : <span />}
          </div>
        )
      })}
    </section>
  )

  // "Get found on Google": asks the dentist to publish a patient case or an
  // article. Both go through the article system (admin approval, shown on the
  // public profile). Shorter once they have posted. Hidden for reception
  // staff, who can't open Articles.
  const recentArticles = ((recentArticleRows ?? []) as Array<{ id: string; title: string; status: string }>)
  const hasPosts = recentArticles.length > 0
  const ARTICLE_PILL: Record<string, { bg: string; text: string; label: string }> = {
    published: { bg: '#DCFCE7', text: '#166534', label: 'Live' },
    pending:   { bg: '#FEF3C7', text: '#92400E', label: 'In review' },
    rejected:  { bg: '#FEE2E2', text: '#991B1B', label: 'Needs changes' },
  }
  const pubBtn: React.CSSProperties = {
    minHeight: 50, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 13.5, textAlign: 'center', padding: '6px 8px', gap: 1, textDecoration: 'none', lineHeight: 1.25,
  }
  const whyRow = (head: string, rest: string) => (
    <li style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.4, color: '#334155' }}>
      <span style={{ color: TEAL_DARK, display: 'flex', marginTop: 1, flexShrink: 0 }}><CheckIcon /></span>
      <span><b>{head}</b> {rest}</span>
    </li>
  )
  const publishCard = dentist.__staffRole !== 'reception' && (
    <section style={{ background: '#fff', border: '1.5px solid #99E6DA', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(160deg, #F0FDFA 0%, #FFFFFF 70%)', padding: '14px 16px 12px', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEAL_DARK }}>
          <SearchIcon size={14} /> {hasPosts ? 'Your pages on Google' : 'Get found on Google'}
        </div>
        {hasPosts ? (
          <>
            <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--muted)' }}>
              <span><b style={{ color: 'var(--text)', fontSize: 16 }}>{articleCount ?? 0}</b> live</span>
              {(articlePendingCount ?? 0) > 0 && <span><b style={{ color: 'var(--text)', fontSize: 16 }}>{articlePendingCount}</b> waiting for approval</span>}
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
              Keep going. One new case a month keeps your profile fresh for Google and for patients.
            </p>
          </>
        ) : (
          <>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 17, lineHeight: 1.25, fontWeight: 800 }}>
              Patients Google a dentist before they book. Show them your work.
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
              Every case or article you publish becomes its own page on Google, with your name, your clinic and a link to book you.
            </p>
            <ul style={{ display: 'grid', gap: 6, margin: '2px 0 0', padding: 0, listStyle: 'none' }}>
              {whyRow('Ranks you higher.', 'More useful pages about you means more searches you can show up in.')}
              {whyRow('Builds your brand.', `It shows on your DentistIn ${dentistCity.cityName} profile and DentistIn India.`)}
              {whyRow('Patients trust real results.', 'A before and after case does more than any ad.')}
            </ul>
          </>
        )}
      </div>
      {hasPosts && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {recentArticles.map(a => {
            const pill = ARTICLE_PILL[a.status] || { bg: '#F1F5F9', text: '#475569', label: a.status }
            return (
              <Link key={a.id} href={`${D}/articles`} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, textDecoration: 'none', color: 'var(--text)' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{a.title}</span>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap', background: pill.bg, color: pill.text }}>{pill.label}</span>
              </Link>
            )
          })}
          <Link href={`${D}/articles`} style={{ display: 'block', padding: '10px 16px', fontSize: 12.5, fontWeight: 700, color: TEAL_DARK, textDecoration: 'none' }}>See all your posts →</Link>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12, borderTop: hasPosts ? '1px solid var(--border)' : 'none' }}>
        <Link href={`${D}/articles/new?topic=case_story`} style={{ ...pubBtn, background: TEAL, color: '#fff' }}>
          Publish a patient case
          {!hasPosts && <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>with patient consent</span>}
        </Link>
        <Link href={`${D}/articles/new`} style={{ ...pubBtn, background: '#fff', color: 'var(--text)', border: '1.5px solid var(--border)' }}>
          Write an article
          {!hasPosts && <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--muted)' }}>tips, FAQs, treatments</span>}
        </Link>
      </div>
      {!hasPosts && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '9px 16px', fontSize: 12, color: 'var(--muted)' }}>
          About 10 minutes. AI writes the first draft for you. Our team checks it before it goes live.
        </div>
      )}
    </section>
  )

  const stars = (n: number) => (
    <span role="img" aria-label={`${n} out of 5 stars`} style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={i <= n ? '#F59E0B' : '#475569'} /></svg>
      ))}
    </span>
  )
  const reviewsCard = (reviewCount ?? 0) > 0 && (
    <section style={{ ...card, background: freshReview ? NAVY : '#fff', color: freshReview ? '#fff' : 'var(--text)', border: freshReview ? 'none' : card.border }}>
      {freshReview && (
        <div style={{ padding: '14px 16px 4px', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5EEAD4' }}>Latest review</span>
            <span style={{ fontSize: 12, color: '#CBD5E1' }}>{formatDateLabel(freshReview.created_at.slice(0, 10))}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {stars(freshReview.rating)}
            <b style={{ fontSize: 14 }}>{freshReview.patient_name || 'Verified patient'}{freshReview.treatment ? ` · ${freshReview.treatment}` : ''}</b>
          </div>
          {freshReview.review_text && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#E2E8F0' }}>&ldquo;{freshReview.review_text}&rdquo;</p>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '10px 8px' }}>
        {[
          { value: avgRating ? avgRating.toFixed(1) : '–', label: 'your rating' },
          { value: String(reviewCount ?? 0), label: (reviewCount ?? 0) === 1 ? 'review' : 'reviews' },
          { value: `+${weekReviewCount ?? 0}`, label: 'this week' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <b style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800 }}>{s.value}</b>
            <span style={{ fontSize: 12, color: freshReview ? '#CBD5E1' : 'var(--muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '0 12px 12px' }}>
        <Link href={`${D}/reviews`} style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none', background: freshReview ? TEAL : '#fff', color: freshReview ? '#04211D' : 'var(--text)', border: freshReview ? 'none' : '1.5px solid var(--border)' }}>
          See and reply to reviews
        </Link>
      </div>
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
      {profileUrl && (
        <details className="dh-grow">
          <summary style={rowStyle}>{growRow(<StarIcon />, reviewCount ? 'Ask a patient for a review' : 'Ask for your first review', 'Send a WhatsApp with a one-tap review link')}</summary>
          <div style={{ padding: '0 12px 4px' }}><RequestReviewCard profileUrl={profileUrl} clinicName={clinicName} dentistName={dentist.name || ''} /></div>
        </details>
      )}
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
          <div className="dh-pub-left">{publishCard}</div>
          {needsReply}
          {todayListCard}
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {reviewsCard}
          <div className="dh-pub-right">{publishCard}</div>
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
        .dh-pub-left { display: none; }
        .dh-pub-left:empty, .dh-pub-right:empty { display: none !important; }
        @media (max-width: 900px) {
          .dh-cols { grid-template-columns: minmax(0, 1fr) !important; }
          .dh-pub-left { display: block; }
          .dh-pub-right { display: none; }
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
