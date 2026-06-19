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

export const dynamic = 'force-dynamic'

const IST_TZ = 'Asia/Kolkata'

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

function formatTimeLabel(slot: string | null | undefined): string {
  if (!slot) return '—'
  const [hStr, mStr] = slot.split(':')
  const h = Number(hStr); const m = Number(mStr)
  if (isNaN(h)) return slot
  const hour12 = ((h + 11) % 12) + 1
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'no_show'])

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/for-dentists/login')

  const dentist = await resolveCurrentDentist<any>(
    supabase,
    'id, name, clinic_name, slug, city, tier, is_verified, profile_photo, cover_photo, bio, phone, whatsapp, working_hours, maps_embed, created_at',
  )

  if (!dentist) redirect('/for-dentists/login')

  const todayIso = istTodayIso()
  const todayLabel = istTodayLabel()
  const clinicName = (dentist as any).clinic_name || dentist.name || ''
  // Public profile URL the overview QR card encodes — resolved from the
  // dentist's city so the host matches the live listing's domain.
  const profileUrl = dentist.slug
    ? `https://${getCityBySlug((dentist as any).city).domain}/dentist/${dentist.slug}`
    : ''
  // Start of the current calendar month in UTC. Used as the lower bound on
  // "this month" appointment counts and engagement-event aggregates so the
  // cards line up with how a clinic reads "this month" rather than a
  // rolling 30-day window.
  const _ms = new Date()
  _ms.setUTCDate(1); _ms.setUTCHours(0, 0, 0, 0)
  const monthStartIso = _ms.toISOString()

  // analytics_events has RLS that blocks the authenticated-dentist role
  // from SELECTing even their own rows — the lifetime counter columns on
  // `dentists` (profile_views, whatsapp_clicks) work because they live on
  // a row the dentist can read, but the per-event log table doesn't. Use
  // the service-role client for the MTD aggregate; the dentist_id filter
  // is locked to the auth-resolved dentist row above so this isn't a
  // privilege escalation.
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [
    { count: appointmentCount },
    { count: enquiryCount },
    { count: reviewCount },
    { count: photoCount },
    { count: treatmentCount },
    { count: pendingCount },
    { count: monthApptCount },
    { data: todayAppts },
    { data: priorPhones },
    { data: unpaidInvoices },
    { data: monthEngagementEvents },
  ] = await Promise.all([
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('enquiries').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved'),
    supabase.from('gallery_photos').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('dentist_treatments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'pending'),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).gte('created_at', monthStartIso),
    supabase
      .from('appointments')
      .select('id, patient_name, patient_phone, appt_date, time_slot, status, treatments(name)')
      .eq('dentist_id', dentist.id)
      .eq('appt_date', todayIso)
      .order('time_slot', { ascending: true }),
    supabase
      .from('appointments')
      .select('patient_phone')
      .eq('dentist_id', dentist.id)
      .lt('appt_date', todayIso),
    supabase
      .from('invoices')
      .select('total, payment_status')
      .eq('dentist_id', dentist.id)
      .in('payment_status', ['pending', 'overdue']),
    adminClient
      .from('analytics_events')
      .select('event_type')
      .eq('dentist_id', dentist.id)
      .gte('created_at', monthStartIso),
  ])

  // Recent appointments — include id and patient_phone so the inline
  // confirm/decline buttons can address the row and the dashboard can
  // resolve the patient record if needed downstream.
  const { data: recentAppts } = await supabase
    .from('appointments')
    .select('id, reference_no, patient_name, appt_date, time_slot, status')
    .eq('dentist_id', dentist.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Month-to-date engagement aggregates derived from analytics_events.
  // We pre-bucket the event types we surface so the JSX stays cheap.
  const monthEv = (monthEngagementEvents || []) as Array<{ event_type: string }>
  const monthEngagement = {
    profile_views:   monthEv.filter(e => e.event_type === 'profile_view').length,
    whatsapp_clicks: monthEv.filter(e => e.event_type === 'whatsapp_click').length,
  }

  // Today summary computations
  const todayList = ((todayAppts ?? []) as unknown) as Array<{
    id: string; patient_name: string | null; patient_phone: string | null;
    appt_date: string; time_slot: string | null; status: string;
    treatments: { name: string | null } | null;
  }>
  const totalToday = todayList.length
  const priorPhoneSet = new Set<string>(((priorPhones ?? []) as Array<{ patient_phone: string | null }>)
    .map(r => r.patient_phone || '')
    .filter(Boolean))
  let newCount = 0
  let followUpCount = 0
  for (const a of todayList) {
    if (a.patient_phone && priorPhoneSet.has(a.patient_phone)) followUpCount++
    else newCount++
  }
  // Next appointment: earliest non-closed slot today, preferring future-of-now,
  // falling back to earliest of any non-closed slot if none in the future.
  const nowHm = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const upcoming = todayList
    .filter(a => !CLOSED_STATUSES.has(a.status) && (a.time_slot ?? '') > nowHm)
    .sort((a, b) => (a.time_slot ?? '').localeCompare(b.time_slot ?? ''))
  const anyOpen = todayList
    .filter(a => !CLOSED_STATUSES.has(a.status))
    .sort((a, b) => (a.time_slot ?? '').localeCompare(b.time_slot ?? ''))
  const nextAppt = upcoming[0] || anyOpen[0] || null

  const pendingDue = ((unpaidInvoices ?? []) as Array<{ total: number | null }>)
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0)

  const todayApptsForMsg: TodayAppt[] = todayList.map(a => ({
    time_slot: a.time_slot,
    patient_name: a.patient_name,
    treatment: a.treatments?.name ?? null,
    status: a.status,
  }))

  // Onboarding checklist — 4 critical fields a dentist must fill before their
  // profile is patient-ready. Card hides once everything is done.
  const completionItems = [
    { label: 'Profile photo',     done: !!dentist.profile_photo,                       href: '/for-dentists/dashboard/photos' },
    { label: 'Bio (20+ chars)',   done: !!(dentist.bio && dentist.bio.length > 20),    href: '/for-dentists/dashboard/profile' },
    { label: 'Working hours',     done: !!dentist.working_hours,                       href: '/for-dentists/dashboard/hours' },
    { label: 'Phone number',      done: !!dentist.phone,                               href: '/for-dentists/dashboard/profile' },
  ]
  const pct = Math.round((completionItems.filter(i => i.done).length / completionItems.length) * 100)

  const STATS = [
    { icon: '📅', label: "Today's Appointments", value: totalToday, href: '/for-dentists/dashboard/appointments' },
    { icon: '⏳', label: 'Pending Approval', value: pendingCount || 0, href: '/for-dentists/dashboard/appointments?status=pending' },
    { icon: '🗓️', label: 'This Month', value: monthApptCount || 0, href: '/for-dentists/dashboard/appointments' },
    { icon: '👁️', label: 'Profile Views · MTD', value: monthEngagement.profile_views, href: '/for-dentists/dashboard/analytics' },
    { icon: '💚', label: 'WhatsApp Clicks · MTD', value: monthEngagement.whatsapp_clicks, href: '/for-dentists/dashboard/analytics' },
    { icon: '📅', label: 'Total Appointments', value: appointmentCount || 0, href: '/for-dentists/dashboard/appointments' },
    { icon: '💬', label: 'Enquiries', value: enquiryCount || 0, href: '/for-dentists/dashboard/enquiries' },
    { icon: '⭐', label: 'Approved Reviews', value: reviewCount || 0, href: '/for-dentists/dashboard/profile' },
  ]

  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    confirmed: { bg: '#DBEAFE', text: '#1D4ED8' },
    completed: { bg: '#DCFCE7', text: '#166534' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  }

  return (
    <div>
      {/* Onboarding checklist — appears first when profile is incomplete, hides at 100%. */}
      {pct < 100 && (
        <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 20, boxShadow: '0 4px 14px rgba(15,25,35,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 4 }}>Get started</div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>Finish setting up your profile</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--blue)' }}>{pct}%</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{completionItems.filter(i => i.done).length} of {completionItems.length} done</span>
            </div>
          </div>
          <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #0057A8, #00A878)', borderRadius: 4, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {completionItems.map(item => (
              <Link key={item.label} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                background: item.done ? '#F0FDF4' : 'var(--bg)',
                border: `1px solid ${item.done ? '#BBF7D0' : 'var(--border)'}`,
                textDecoration: 'none',
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: item.done ? '#00A878' : '#fff',
                  border: item.done ? 'none' : '1.5px solid #CBD5E1',
                  color: '#fff', fontSize: 12, fontWeight: 800,
                }}>{item.done ? '✓' : ''}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: item.done ? '#166534' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none' }}>
                  {item.label}
                </span>
                {!item.done && <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 700 }}>→</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Today's Schedule */}
      <section style={{
        background: 'linear-gradient(135deg, #0057A8 0%, #003F7A 100%)',
        color: '#fff', borderRadius: 18, padding: '20px 24px', marginBottom: 20,
        boxShadow: '0 6px 20px rgba(0,87,168,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>
              Today
            </div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(20px, 3vw, 28px)', lineHeight: 1.15 }}>
              {todayLabel}
            </h2>
          </div>
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
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <ScheduleTile
            label="Appointments"
            value={String(totalToday)}
            sub={totalToday === 0 ? 'Nothing on the books' : `${totalToday === 1 ? '1 patient' : `${totalToday} patients`} expected`}
          />
          <ScheduleTile
            label="Mix"
            value={`${newCount} / ${followUpCount}`}
            sub="new · follow-up"
          />
          <ScheduleTile
            label="Next up"
            value={nextAppt ? formatTimeLabel(nextAppt.time_slot) : '—'}
            sub={nextAppt ? (nextAppt.patient_name ?? 'Patient') : (totalToday === 0 ? 'No appointments today' : 'All done')}
          />
          <ScheduleTile
            label="Pending dues"
            value={`₹${pendingDue.toLocaleString('en-IN')}`}
            sub={pendingDue === 0 ? 'All invoices settled' : 'Across unpaid invoices'}
          />
        </div>
      </section>

      {/* Welcome */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>
            Welcome back, {dentist.name?.split(' ')[0]} 👋
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>
            {dentist.is_verified ? '✅ Verified listing' : '⏳ Verification pending'}
          </p>
        </div>
        <AutoRefresh />
      </div>

      {/* Primary CTAs — Walk-in is the dominant action */}
      <div className="dash-primary-ctas" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
        <Link href="/for-dentists/dashboard/patients?new=1"
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '22px 24px', minHeight: 96,
            background: 'linear-gradient(135deg, #00A878 0%, #00875E 100%)',
            color: '#fff', borderRadius: 16, textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(0,168,120,0.28)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>👤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 4 }}>Most used</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1.1, marginBottom: 4 }}>Walk-in Patient</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Register a new patient who just walked in.</div>
          </div>
          <span style={{ fontSize: 24, opacity: 0.85, flexShrink: 0 }}>→</span>
        </Link>

        <Link href="/for-dentists/dashboard/appointments?new=1"
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '22px 24px', minHeight: 96,
            background: 'linear-gradient(135deg, #0057A8 0%, #003F7A 100%)',
            color: '#fff', borderRadius: 16, textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(0,87,168,0.24)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>📅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1.1, marginBottom: 4 }}>Book Appointment</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Schedule a future visit.</div>
          </div>
          <span style={{ fontSize: 24, opacity: 0.85, flexShrink: 0 }}>→</span>
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {STATS.map(stat => (
          <Link key={stat.label} href={stat.href} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', display: 'block', textDecoration: 'none', transition: 'box-shadow 0.2s' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Share Your Profile — always-visible QR to the public listing. */}
      {profileUrl && <ProfileQRCard profileUrl={profileUrl} clinicName={clinicName} />}

      {/* Get Your First Review — WhatsApp a review request to an existing patient. */}
      {profileUrl && <RequestReviewCard profileUrl={profileUrl} clinicName={clinicName} dentistName={dentist.name || ''} />}

      {/* Recent appointments */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Recent Appointments</h3>
          <Link href="/for-dentists/dashboard/appointments" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
        </div>
        {recentAppts && recentAppts.length > 0 ? (
          <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                {['Reference', 'Patient', 'Date', 'Time', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--bg)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAppts.map((a: any) => {
                const sc = STATUS_COLORS[a.status] || { bg: '#F3F4F6', text: '#374151' }
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600 }}>{a.reference_no}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{a.patient_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(a.appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{a.time_slot}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{a.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <RecentApptActions appointmentId={a.id} status={a.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
            <p style={{ fontSize: 14 }}>No appointments yet. Share your profile to start getting bookings.</p>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .dash-primary-ctas { grid-template-columns: 1fr !important; gap: 12px !important; }
        }
      `}</style>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { icon: '✏️', label: 'Edit Profile', href: '/for-dentists/dashboard/profile', desc: 'Update your clinic details' },
          { icon: '📸', label: 'Upload Photos', href: '/for-dentists/dashboard/photos', desc: 'Add clinic & gallery photos' },
          { icon: '🕐', label: 'Set Hours', href: '/for-dentists/dashboard/hours', desc: 'Configure working hours' },
          { icon: '🦷', label: 'Add Treatments', href: '/for-dentists/dashboard/treatments', desc: 'Set treatments & fees' },
        ].map(action => (
          <Link key={action.label} href={action.href} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textDecoration: 'none', display: 'block', transition: 'box-shadow 0.2s' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{action.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', marginBottom: 4, color: 'var(--text)' }}>{action.label}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{action.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ScheduleTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.12)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.75, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1.15 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sub}
      </div>
    </div>
  )
}
